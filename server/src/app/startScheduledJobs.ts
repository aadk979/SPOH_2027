import { randomUUID } from 'node:crypto';
import { authRecurringActions, authScheduledHandlers } from '../modules/auth/index.js';
import {
  announcementScheduledHandlers,
  deliverAnnouncementBatch,
} from '../modules/announcement/index.js';
import { settingsScheduledHandlers } from '../modules/settings/index.js';
import { eventScheduledHandlers } from '../modules/event/index.js';
import { reportScheduledHandlers } from '../modules/report/index.js';
import { registrationScheduledHandlers } from '../modules/registration/index.js';
import { visitorRecurringActions, visitorScheduledHandlers } from '../modules/visitor/index.js';
import {
  lostPersonRecurringActions,
  lostPersonScheduledHandlers,
} from '../modules/lostPerson/index.js';
import {
  idempotencyRecurringActions,
  idempotencyScheduledHandlers,
} from '../platform/idempotency/jobs.js';
import { ensureRecurring } from '../platform/scheduler/ensureRecurring.js';
import { HandlerRegistry } from '../platform/scheduler/registry.js';
import { startSchedulerWorker } from '../platform/scheduler/startWorker.js';
import type { Clock } from '../platform/time/index.js';
import { createEventRecurringSync } from './syncEventRecurring.js';

/** Module catalogue and recurring declarations are composed once per API instance. */
export async function startScheduledJobs(clock?: Clock) {
  const workerId = randomUUID();
  const registry = new HandlerRegistry([
    ...authScheduledHandlers,
    ...idempotencyScheduledHandlers,
    ...lostPersonScheduledHandlers,
    ...visitorScheduledHandlers,
    ...settingsScheduledHandlers,
    ...eventScheduledHandlers,
    ...reportScheduledHandlers,
    ...registrationScheduledHandlers,
    ...announcementScheduledHandlers,
  ]);
  for (const action of [...authRecurringActions, ...idempotencyRecurringActions]) {
    await ensureRecurring({ ...action, registry, clock });
  }
  const syncEvents = createEventRecurringSync({
    registry,
    actions: [...lostPersonRecurringActions, ...visitorRecurringActions],
    clock,
  });
  await syncEvents();
  return startSchedulerWorker({
    registry,
    clock,
    workerId,
    beforeClaim: syncEvents,
    afterActions: () => deliverAnnouncementBatch({ workerId, clock }),
  });
}
