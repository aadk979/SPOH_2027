import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { currentManagement } from './currentManagement.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';
import { revokeAllInTransaction } from '../../auth/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { deliverIdentityInvitation } from '../../../platform/identity/invitationDelivery.js';
import { ValidationError } from '../../../platform/errors/index.js';

export async function resendInvite(id: string, actor: ManagerContext, requestKey?: string) {
  if (!requestKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey))
    throw new ValidationError('An invitation request UUID is required. Keep it when retrying this invitation.');
  await loadTarget(id, actor, 'resend');
  const organisationId = await prisma.$transaction(async (tx) => {
    await currentManagement(tx, actor, { id, action: 'People.Update' });
    const event = await tx.event.findUniqueOrThrow({ where: { id: actor.scope.eventId }, select: { organisationId: true } });
    return event.organisationId;
  });
  return deliverIdentityInvitation({ provider: identityProvider, targetPoolId: identityProvider.poolId ?? '',
    organisationId, personId: id, actorPersonId: actor.volunteerId, requestKey, audit: actor.audit,
    authorize: async (tx) => { await currentManagement(tx, actor, { id, action: 'People.Update' }); } });
}

export async function signOutPerson(id: string, actor: ManagerContext) {
  return prisma.$transaction(async (tx) => {
    await currentManagement(tx, actor, { id, action: 'People.Deactivate' });
    const sessionsRevoked = await revokeAllInTransaction(tx, {
      personId: id,
      at: systemClock.now(),
      reason: 'signed-out-by-administrator',
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'session.revoke',
      entityType: 'Person',
      entityId: id,
      after: { sessionsRevoked, reason: 'signed-out-by-administrator' },
    });
    return { sessionsRevoked };
  });
}
