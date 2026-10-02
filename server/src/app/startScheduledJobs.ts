import { authRecurringActions, authScheduledHandlers } from '../modules/auth/index.js';
import {
  idempotencyRecurringActions,
  idempotencyScheduledHandlers,
} from '../platform/idempotency/jobs.js';
import { ensureRecurring } from '../platform/scheduler/ensureRecurring.js';
import { HandlerRegistry } from '../platform/scheduler/registry.js';
import { startSchedulerWorker } from '../platform/scheduler/startWorker.js';
import type { Clock } from '../platform/time/index.js';

/** Module catalogue and recurring declarations are composed once per API instance. */
export async function startScheduledJobs(clock?: Clock) {
  const registry = new HandlerRegistry([...authScheduledHandlers, ...idempotencyScheduledHandlers]);
  for (const action of [...authRecurringActions, ...idempotencyRecurringActions]) {
    await ensureRecurring({ ...action, registry, clock });
  }
  return startSchedulerWorker({ registry, clock });
}
