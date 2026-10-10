import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { systemEventScope } from '../../platform/scheduler/systemAuthority.js';
import { purgeStaffInTransaction } from './application/staffRetention.js';

export const peopleScheduledHandlers = [defineScheduledHandler({
  type: 'retention.staff', schema: z.object({}).strict(),
  authorize: async (context) => { systemEventScope(context); },
  run: async (context) => { await purgeStaffInTransaction(context.tx, systemEventScope(context), context); },
})];
// Backstop also handles archives created before this handler was deployed.
export const peopleRecurringActions = [{ type: 'retention.staff', intervalSeconds: 86400 }] as const;
