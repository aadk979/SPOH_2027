import type { IdentityMutationResponse, PersonDetailResponse } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { requireCurrentOrganisationPermission } from '../../../platform/access/currentOrganisation.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../../platform/errors/index.js';
import { ERROR_CODES } from '@spoh/shared';
import { identityProvider, invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { revokeAllInTransaction } from '../../auth/index.js';
import { personDetail, changePersonStanding, holdManagedPerson } from '../data/personRepo.js';
import { deletePushSubscriptions } from '../data/repo.js';
import { personMutation } from './personMutation.js';

export interface PersonActor {
  personId: string;
  sub: string;
  audit: AuditContext;
  idempotencyKey?: string;
}

export async function permittedPerson(tx: PrismaTransactionClient, id: string, actor: PersonActor) {
  await holdManagedPerson(tx, { targetId: id, actorId: actor.personId });
  const target = await personDetail(id, tx);
  if (!target) throw new NotFoundError('Person');
  const organisations = [...new Set([...target.organisationMemberships.map((member) => member.organisationId),
    ...target.eventMemberships.map((member) => member.event.organisationId)])].sort();
  if (!organisations.length) throw new NotFoundError('Person');
  for (const organisationId of organisations) {
    try {
      await requireCurrentOrganisationPermission(tx, { organisationId, personId: actor.personId,
        subject: actor.sub, action: 'Platform.ManageAdmins' });
    } catch (error) {
      // Target-specific authority must not disclose whether a foreign Person exists.
      if (error instanceof ForbiddenError || error instanceof NotFoundError) throw new NotFoundError('Person');
      throw error;
    }
  }
  return target;
}

function requireOtherAccount(id: string, actor: PersonActor) {
  if (id === actor.personId) throw new ForbiddenError('Ask another platform administrator to change your account');
}

export async function getPersonDetail(
  id: string,
  actor: PersonActor,
): Promise<PersonDetailResponse> {
  const target = await prisma.$transaction((tx) => permittedPerson(tx, id, actor));
  const { eventMemberships } = target;
  return {
    person: { id: target.id, displayName: target.displayName, email: target.email,
      deactivatedAt: target.deactivatedAt?.toISOString() ?? null },
    memberships: eventMemberships.map((member) => ({
      id: member.id,
      eventId: member.eventId,
      eventName: member.event.name,
      role: member.role,
      status: member.status,
      acceptedAt: member.acceptedAt?.toISOString() ?? null,
      lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    })),
  };
}

export async function deactivatePerson(
  id: string,
  input: { reason: string; actor: PersonActor },
): Promise<IdentityMutationResponse> {
  const now = systemClock.now();
  requireOtherAccount(id, input.actor);
  const result = await personMutation({ personId: id, actorSub: input.actor.sub,
    operation: 'deactivate', idempotencyKey: input.actor.idempotencyKey, reason: input.reason,
    authorizeReplay: (tx) => permittedPerson(tx, id, input.actor) }, async (tx) => {
    const target = await permittedPerson(tx, id, input.actor);
    await identityProvider.disableUser(target.email, target.cognitoSub);
    await changePersonStanding(tx, { id, at: now, reason: input.reason });
    await deletePushSubscriptions(tx, id);
    const sessionsRevoked = await revokeAllInTransaction(tx, {
      personId: id,
      at: now,
      reason: 'person-deactivated',
    });
    await auditPerson(tx, {
      id,
      actor: input.actor,
      action: 'user.deactivate',
      after: { global: true, reasonRecorded: true, sessionsRevoked },
    });
    return { sessionsRevoked, identityChanged: true };
  });
  invalidateVolunteerCache();
  return result;
}

export async function reactivatePerson(
  id: string,
  actor: PersonActor,
): Promise<IdentityMutationResponse> {
  requireOtherAccount(id, actor);
  const result = await personMutation({ personId: id, actorSub: actor.sub,
    operation: 'reactivate', idempotencyKey: actor.idempotencyKey,
    authorizeReplay: (tx) => permittedPerson(tx, id, actor) }, async (tx) => {
    const target = await permittedPerson(tx, id, actor);
    if (target.piiErasedAt) throw new ConflictError(ERROR_CODES.CONFLICT, 'This archived profile was anonymised and cannot be reactivated.');
    await identityProvider.enableUser(target.email, target.cognitoSub);
    await changePersonStanding(tx, { id, at: null });
    await auditPerson(tx, { id, actor, action: 'user.reactivate', after: { global: true } });
    return { sessionsRevoked: 0, identityChanged: true };
  });
  invalidateVolunteerCache();
  return result;
}

async function auditPerson(
  tx: PrismaTransactionClient,
  input: {
    id: string;
    actor: PersonActor;
    action: 'user.deactivate' | 'user.reactivate';
    after: object;
  },
) {
  await writeAudit(tx, {
    ...input.actor.audit,
    actorId: input.actor.personId,
    actorSub: input.actor.sub,
    action: input.action,
    entityType: 'Person',
    entityId: input.id,
    after: input.after,
  });
}
