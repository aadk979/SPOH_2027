import { ROLE_RANKS } from '@spoh/access-policies';
import type { CommitteeRole } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { assertWritableEvent } from '../../../platform/db/writableEvent.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { assertMayActOn, assertMayGrant } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';

export async function currentManagement(
  tx: PrismaTransactionClient,
  actor: ManagerContext,
  input: {
    id: string;
    action: 'People.Update' | 'People.Deactivate' | 'People.AssignRole';
    role?: CommitteeRole;
  },
) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${actor.scope.eventId} AND "personId" = ${input.id} FOR UPDATE`;
  const target = await tx.eventMembership.findUnique({
    where: {
      eventId_personId: {
        eventId: actor.scope.eventId,
        personId: input.id,
      },
    },
    select: { id: true, personId: true, role: true },
  });
  if (!target) throw new NotFoundError('Membership');
  assertMayActOn(actor, { id: target.personId, role: target.role }, 'manage');
  assertMayGrant(actor.role, input.role);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.audit.membershipId ?? '',
    personId: actor.volunteerId,
    action: input.action,
    resource: { type: 'Membership', id: target.id },
    ...(input.role ? { facts: { grantedRank: ROLE_RANKS[input.role] } } : {}),
  });
  assertWritableEvent(event);
}
