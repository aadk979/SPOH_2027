import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';
import { purgeVisitorDataInTransaction } from './application/purgeVisitorData.js';

export const visitorScheduledHandlers = [
  defineScheduledHandler({
    type: 'visitor.purge',
    schema: z.object({}).strict(),
    authorize: async (context) => {
      systemEventScope(context);
    },
    run: async (context) => {
      await purgeVisitorDataInTransaction(context.tx, systemEventScope(context), {
        now: context.now,
        audit: context.audit,
      });
    },
  }),
];
export const visitorRecurringActions = [{ type: 'visitor.purge', intervalSeconds: 3600 }] as const;
