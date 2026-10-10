import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';
import { purgeMediaInTransaction } from './application/retention.js';

export const mediaScheduledHandlers = [defineScheduledHandler({
  type: 'retention.media', schema: z.object({}).strict(),
  authorize: async (context) => { systemEventScope(context); },
  run: async (context) => { await purgeMediaInTransaction(context.tx, systemEventScope(context), context); },
})];
export const mediaRecurringActions = [{ type: 'retention.media', intervalSeconds: 86400 }] as const;
