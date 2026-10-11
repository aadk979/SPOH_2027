import { LifecycleTransitionInput } from '@spoh/shared';
import { z } from 'zod';
import type { ActorContext } from '../../platform/http/auditContext.js';
import { ScheduleRefusal } from '../../platform/scheduler/failure.js';
import { defineScheduledHandler, type ScheduleContext } from '../../platform/scheduler/handler.js';
import { fixedClock } from '../../platform/time/index.js';
import { transitionEventInTransaction } from './application/transitionEvent.js';
import { remindArchive } from './application/remindArchive.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';

function transitionActor(context: ScheduleContext): ActorContext {
  const { eventId, createdByPersonId } = context.action;
  const { membershipId } = context.audit;
  if (eventId === null || createdByPersonId === null || membershipId === null) {
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  }
  return {
    scope: { eventId },
    volunteerId: createdByPersonId,
    membershipId,
    audit: context.audit,
  };
}

/** The same locked, current-authority guards/effects as manual transitions; no nested transaction. */
export const eventScheduledHandlers = [
  defineScheduledHandler({
    type: 'event.transition',
    schema: LifecycleTransitionInput,
    authorize: async (context) => {
      transitionActor(context);
      // The shared core rechecks current capability under its membership lock before any effect.
    },
    run: async (context, payload) => {
      await transitionEventInTransaction(context.tx, payload, {
        ...transitionActor(context),
        clock: fixedClock(context.now),
      });
    },
  }),
  defineScheduledHandler({
    type: 'event.archiveReminder',
    schema: z.object({ lifecycleVersion: z.number().int().min(0) }).strict(),
    authorize: async (context) => {
      systemEventScope(context);
    },
    run: async (context, payload) => {
      await remindArchive(context.tx, systemEventScope(context), { ...payload, now: context.now });
    },
  }),
];
