import { ERROR_CODES } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ConflictError, ForbiddenError, ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { Clock } from '../../../platform/time/index.js';

export type ScheduleActor = ActorContext & { clock?: Clock };

/** A year ahead is past any event's planning horizon; further is a typo, not a plan. */
const HORIZON_MS = 366 * 24 * 3600_000;

/** The verified request supplies attribution; a system or replayed context cannot enqueue user work. */
export function requireUserAttribution(actor: ScheduleActor): void {
  const { audit } = actor;
  if (
    audit.actorId !== actor.volunteerId ||
    audit.eventId !== actor.scope.eventId ||
    audit.membershipId !== actor.membershipId
  )
    throw new ForbiddenError('Current event attribution is unavailable.');
  if (!audit.actorSub || (audit.source && audit.source !== 'USER') || audit.scheduledActionId)
    throw new ForbiddenError('Only current event users may schedule changes.');
}

/** Schedule.Manage, checked again under the event's lock; an archived event is read-only. */
export async function requireScheduleManager(tx: PrismaTransactionClient, actor: ScheduleActor) {
  const event = await holdCaptureEvent(tx, actor.scope);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: 'Schedule.Manage',
  });
  requireUserAttribution(actor);
  if (event.status === 'ARCHIVED') {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'An archived event cannot be scheduled.');
  }
  return event;
}

export function requireFutureRunAt(runAt: string, now: Date): Date {
  const at = new Date(runAt);
  if (at.getTime() <= now.getTime()) {
    throw new ValidationError('Choose a time in the future.');
  }
  if (at.getTime() - now.getTime() > HORIZON_MS) {
    throw new ValidationError('Choose a time within the next year.');
  }
  return at;
}
