import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';
import { remindOpenFallback } from './application/fallbackReminder.js';
import { FALLBACK_REMINDER } from './data/reminderRepo.js';

const ReminderPayload = z
  .object({ windowId: z.string().min(1).max(64), sequence: z.number().int().min(1) })
  .strict();

/** Reminders only notify: the system queues them, and a user cannot schedule one. */
export const fallbackScheduledHandlers = [
  defineScheduledHandler({
    type: FALLBACK_REMINDER,
    schema: ReminderPayload,
    authorize: async (context) => {
      systemEventScope(context);
    },
    run: async (context, payload) => {
      await remindOpenFallback(context.tx, systemEventScope(context), {
        ...payload,
        now: context.now,
      });
    },
  }),
];
