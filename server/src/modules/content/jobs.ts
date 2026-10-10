import { PublishContentPayload } from '@spoh/shared';
import { defineScheduledHandler, type ScheduleContext } from '../../platform/scheduler/handler.js';
import { ScheduleRefusal } from '../../platform/scheduler/failure.js';
import { requireCurrentPermission } from '../../platform/access/currentPermission.js';
import { fixedClock } from '../../platform/time/index.js';
import { publishContentInTransaction } from './application/publishContent.js';

function scheduledContentActor(context: ScheduleContext) {
  const { action, audit } = context;
  if (
    !action.eventId ||
    !action.createdByPersonId ||
    !audit.membershipId ||
    audit.actorId !== action.createdByPersonId ||
    audit.eventId !== action.eventId ||
    audit.source !== 'SCHEDULE' ||
    audit.scheduledActionId !== action.id ||
    action.recurrence !== null
  )
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  return {
    scope: { eventId: action.eventId },
    volunteerId: action.createdByPersonId,
    membershipId: audit.membershipId,
    audit,
    clock: fixedClock(context.now),
  };
}
export const contentScheduledHandlers = [
  defineScheduledHandler({
    type: 'content.publish',
    schema: PublishContentPayload,
    authorize: async (context) => {
      const actor = scheduledContentActor(context);
      for (const action of ['Content.Publish', 'Schedule.Manage'] as const)
        await requireCurrentPermission(context.tx, {
          scope: actor.scope,
          membershipId: actor.membershipId,
          personId: actor.volunteerId,
          action,
          clock: actor.clock,
        });
    },
    run: async (context, request) => {
      await publishContentInTransaction(context.tx, {
        actor: scheduledContentActor(context),
        expectedVersion: request.expectedVersion,
      });
    },
  }),
];
