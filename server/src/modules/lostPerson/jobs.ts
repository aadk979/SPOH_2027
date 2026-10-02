import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';
import { purgeResolvedAlertsInTransaction } from './application/purgeResolvedAlerts.js';

export const lostPersonScheduledHandlers = [
  defineScheduledHandler({
    type: 'lostPerson.purge',
    schema: z.object({}).strict(),
    authorize: async (context) => {
      systemEventScope(context);
    },
    run: async (context) => {
      await purgeResolvedAlertsInTransaction(context.tx, systemEventScope(context), {
        now: context.now,
        audit: context.audit,
      });
    },
  }),
];
export const lostPersonRecurringActions = [
  { type: 'lostPerson.purge', intervalSeconds: 15 * 60 },
] as const;
