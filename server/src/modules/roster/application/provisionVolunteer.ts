import type { ProvisionVolunteerRequest, ProvisionVolunteerResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { identityProvider } from '../../identity/index.js';
import { toVolunteerRecord } from '../data/mappers.js';
import { findVolunteerByEmail, upsertVolunteer } from '../data/repo.js';
import { assertMayManage } from '../domain/escalation.js';
import type { RosterActor } from './context.js';

/**
 * Provisioning creates the identity and the `Volunteer` row together, so a
 * volunteer who can sign in is by construction a volunteer on the roster (BUILD_PLAN §6.1).
 */
export async function provisionVolunteer(
  request: ProvisionVolunteerRequest,
  actor: RosterActor,
): Promise<ProvisionVolunteerResponse> {
  const reportsTo = request.reportsToEmail
    ? await findVolunteerByEmail(request.reportsToEmail)
    : null;
  if (request.reportsToEmail && !reportsTo) {
    throw new ValidationError('The manager named in reportsToEmail is not on the roster', {
      field: 'reportsToEmail',
    });
  }

  const existing = await findVolunteerByEmail(request.email);
  assertMayManage(actor, { role: request.role, existing });

  // Only mint an identity for someone who does not have one. Re-provisioning is
  // a normal operation (a role change, a corrected phone number) and must not
  // send a second invite email to someone who already signed in.
  const identity = existing
    ? { sub: existing.cognitoSub, created: false }
    : await identityProvider.ensureUser({
        email: request.email,
        displayName: request.displayName,
        role: request.role,
      });

  const volunteer = await prisma.$transaction(async (tx) => {
    const { volunteer: row } = await upsertVolunteer(tx, {
      cognitoSub: identity.sub,
      displayName: request.displayName,
      email: request.email,
      phone: request.phone ?? null,
      role: request.role,
      portfolio: request.portfolio ?? null,
      reportsToId: reportsTo?.id ?? null,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.provision',
      entityType: 'Volunteer',
      entityId: row.id,
      ...(existing ? { before: { role: existing.role, active: existing.active } } : {}),
      after: { email: row.email, role: row.role, active: row.active },
    });
    return row;
  });

  // The auth middleware caches sub -> volunteer for 60 seconds. A role change
  // should take effect on the next request, not on the next minute.
  invalidateVolunteerCache(identity.sub);
  return { volunteer: toVolunteerRecord(volunteer), identityCreated: identity.created };
}
