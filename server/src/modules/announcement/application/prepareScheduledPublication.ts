import { ERROR_CODES, type PublishAnnouncementPayload } from '@spoh/shared';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { ScheduleRefusal } from '../../../platform/scheduler/failure.js';
import type { ScheduleContext } from '../../../platform/scheduler/handler.js';
import { fixedClock } from '../../../platform/time/index.js';
import { findOwnDraft, lockDraftEvent } from '../data/draftRepo.js';
import { prepareDraftMutation, type DraftActor } from './prepareDraftMutation.js';

export function scheduledPublicationActor(context: ScheduleContext): DraftActor {
  const { action, audit } = context;
  if (
    action.eventId === null ||
    action.createdByPersonId === null ||
    audit.membershipId === null ||
    audit.actorId !== action.createdByPersonId ||
    audit.eventId !== action.eventId ||
    audit.source !== 'SCHEDULE' ||
    audit.scheduledActionId !== action.id
  ) {
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  }
  if (action.recurrence !== null) throw new ScheduleRefusal('SYSTEM_ONLY');
  return {
    scope: { eventId: action.eventId },
    volunteerId: action.createdByPersonId,
    membershipId: audit.membershipId,
    audit,
    // The scheduler already samples now after acquiring Event, then the action lock.
    clock: fixedClock(context.now),
  };
}

export async function prepareScheduledPublication(
  context: ScheduleContext,
  payload: PublishAnnouncementPayload,
) {
  const actor = scheduledPublicationActor(context);
  const { tx } = context;
  if ((await lockDraftEvent(actor.scope, tx)).status === 'ARCHIVED') {
    throw new ScheduleRefusal('GUARD_FAILED');
  }
  const draft = await findOwnDraft(
    actor.scope,
    { id: payload.draftId, authorId: actor.volunteerId },
    tx,
  );
  if (!draft) throw new NotFoundError('Announcement draft');
  if (draft.version !== payload.expectedVersion) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The draft changed. Review and schedule again.');
  }
  if (draft.expiresAt && draft.expiresAt.getTime() <= context.now.getTime()) {
    throw new ScheduleRefusal('TOO_LATE');
  }
  const { now, scope } = await prepareDraftMutation(tx, {
    actor,
    request: {
      body: draft.body,
      priority: draft.priority,
      requiresAck: draft.requiresAck,
      target: {
        role: draft.targetRole,
        stationId: draft.targetStationId,
        eventDayId: draft.targetEventDayId,
      },
      expiresAt: draft.expiresAt?.toISOString(),
    },
  });
  return { actor, draft, now, scope };
}
