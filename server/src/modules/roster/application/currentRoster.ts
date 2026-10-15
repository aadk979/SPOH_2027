import { ROLE_RANKS, type Action } from '@spoh/access-policies';
import type { CommitteeRole } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { isPlatformAdministrator } from '../../../platform/access/platformAdministrator.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { assertWritableEvent } from '../../../platform/db/writableEvent.js';
import type { RosterActor } from './context.js';

export async function currentRoster(
  tx: PrismaTransactionClient,
  actor: RosterActor,
  input: { action: Action; role?: CommitteeRole },
) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    personId: actor.volunteerId,
    membershipId: actor.audit.membershipId ?? '',
    action: input.action,
    asPerson:
      input.action === 'People.Invite' &&
      (await isPlatformAdministrator(tx, {
        scope: actor.scope,
        personId: actor.volunteerId,
      })),
    resource: { type: 'Event', id: actor.scope.eventId },
    ...(input.role ? { facts: { grantedRank: ROLE_RANKS[input.role] } } : {}),
  });
  assertWritableEvent(event);
}
