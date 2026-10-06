import { ERROR_CODES } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';
import { lockCategoryEvent } from '../data/categoryReadRepo.js';

export type CategoryScheduleActor = ActorContext & { clock?: Clock };

async function categoryCapability(tx: PrismaTransactionClient, actor: CategoryScheduleActor) {
  await requireCurrentCapability(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    capability: 'config.manage',
  });
}
export async function readCategoryAuthority(
  tx: PrismaTransactionClient,
  actor: CategoryScheduleActor,
) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await categoryCapability(tx, actor);
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
  await categoryCapability(tx, actor);
  requireCategoryAttribution(actor);
  if (event.status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived category schedules are read-only.');
  return event;
}
