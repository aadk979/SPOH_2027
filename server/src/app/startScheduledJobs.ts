import { authRecurringActions, authScheduledHandlers } from '../modules/auth/index.js';
import { ensureRecurring } from '../platform/scheduler/ensureRecurring.js';
import { HandlerRegistry } from '../platform/scheduler/registry.js';
import { startSchedulerWorker } from '../platform/scheduler/startWorker.js';
import type { Clock } from '../platform/time/index.js';

/** Module catalogue and recurring declarations are composed once per API instance. */
export async function startScheduledJobs(clock?: Clock) {
  const registry = new HandlerRegistry(authScheduledHandlers);
  for (const action of authRecurringActions) await ensureRecurring({ ...action, registry, clock });
  return startSchedulerWorker({ registry, clock });
}
