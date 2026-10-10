import { ERROR_CODES } from '@spoh/shared';
import type { Action } from '@spoh/access-policies';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { lockCategoryEvent } from '../data/categoryReadRepo.js';

export type CategoryScheduleActor = ActorContext & { clock?: Clock };

async function categoryPermission(
  tx: PrismaTransactionClient,
  actor: CategoryScheduleActor,
  action: Action,
) {
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action,
  });
}
export async function readCategoryAuthority(
  tx: PrismaTransactionClient,
  actor: CategoryScheduleActor,
) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await categoryPermission(tx, actor, 'Settings.Read');
  return event;
}

/** The verified request supplies attribution; a system or mismatched context cannot enqueue user work. */
function requireCategoryAttribution(actor: CategoryScheduleActor) {
  const audit = actor.audit;
  if (
    audit.actorId !== actor.volunteerId ||
    audit.eventId !== actor.scope.eventId ||
    audit.membershipId !== actor.membershipId
  )
    throw new ForbiddenError('Current event attribution is unavailable.');
  if (!audit.actorSub || (audit.source && audit.source !== 'USER') || audit.scheduledActionId)
    throw new ForbiddenError('Only current event users may schedule category changes.');
}
export async function lockCategoryAuthority(
  tx: PrismaTransactionClient,
  actor: CategoryScheduleActor,
) {
  const event = await lockCategoryEvent(actor.scope, tx);
  if (!event) throw new NotFoundError('Event');
  await categoryPermission(tx, actor, 'Schedule.Manage');
  requireCategoryAttribution(actor);
  if (event.status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived category schedules are read-only.');
  return event;
}
