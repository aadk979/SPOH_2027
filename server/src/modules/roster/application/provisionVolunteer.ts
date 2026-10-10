import type { ProvisionVolunteerRequest, ProvisionVolunteerResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { toVolunteerRecord } from '../data/mappers.js';
import { findVolunteerByEmail, upsertVolunteer } from '../data/repo.js';
import { assertMayManage } from '../domain/escalation.js';
import type { RosterActor } from './context.js';
import { currentRoster } from './currentRoster.js';
import { identitiesByEmail, reserveIdentityDeliveries } from '../../../platform/identity/deliveryQuota.js';
import { systemClock } from '../../../platform/time/index.js';
import { ForbiddenError } from '../../../platform/errors/index.js';

/**
 * Provisioning creates the identity and the `Volunteer` row together, so a
 * volunteer who can sign in is by construction a volunteer on the roster (BUILD_PLAN §6.1).
 */
export async function provisionVolunteer(
  request: ProvisionVolunteerRequest,
  actor: RosterActor,
): Promise<ProvisionVolunteerResponse> {
  const reportsTo = request.reportsToEmail
    ? await findVolunteerByEmail(actor.scope, request.reportsToEmail)
    : null;
  if (request.reportsToEmail && !reportsTo) {
    throw new ValidationError('The manager named in reportsToEmail is not on the roster', {
      field: 'reportsToEmail',
    });
  }

  const result = await prisma.$transaction((tx) => provisionMembership(tx, {
    request, actor, reportsToId: reportsTo?.id ?? null,
  }), { timeout: 30_000 });
  invalidateVolunteerCache(result.identity.sub);
  return { volunteer: toVolunteerRecord(result.volunteer), identityCreated: result.identity.created };
}

/** Keep archive and permission changes behind the lock until the identity side effect finishes. */
async function provisionMembership(tx: PrismaTransactionClient, input: {
  request: ProvisionVolunteerRequest; actor: RosterActor; reportsToId: string | null;
}) {
  const { request, actor, reportsToId } = input;
  await currentRoster(tx, actor, { action: 'People.Invite', role: request.role });
  const current = await findVolunteerByEmail(actor.scope, request.email, tx);
  assertMayManage(actor, { role: request.role, existing: current });
  const account = await knownAccount(tx, { request, actor });
  const identity = account ? { sub: account.cognitoSub, created: false }
    : await identityProvider.ensureUser({ email: request.email,
      displayName: request.displayName, role: request.role });
  const { volunteer } = await upsertVolunteer(tx, actor.scope, {
      cognitoSub: identity.sub,
      displayName: request.displayName,
      email: request.email,
      phone: request.phone ?? null,
      role: request.role,
      portfolio: request.portfolio ?? null,
      reportsToId,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.provision',
      entityType: 'Volunteer',
      entityId: volunteer.id,
      ...(current ? { before: { role: current.role, active: current.active } } : {}),
      after: { personId: volunteer.id, role: volunteer.role, active: volunteer.active },
    });
  return { volunteer, identity };
}

async function knownAccount(tx: PrismaTransactionClient,
  { request, actor }: { request: ProvisionVolunteerRequest; actor: RosterActor }) {
    const found = (await identitiesByEmail(tx, [request.email])).get(request.email.toLowerCase());
    if (found?.deactivatedAt || found?.piiErasedAt) throw new ForbiddenError('This person must be reactivated by a platform administrator first.');
    await reserveIdentityDeliveries(tx, { scope: actor.scope, count: found ? 0 : 1, now: systemClock.now() });
    return found;
}
