import { randomUUID } from 'node:crypto';
import { authRecurringActions, authScheduledHandlers } from '../modules/auth/index.js';
import {
  announcementScheduledHandlers,
  deliverAnnouncementBatch,
} from '../modules/announcement/index.js';
import { settingsScheduledHandlers } from '../modules/settings/index.js';
import { contentScheduledHandlers } from '../modules/content/index.js';
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
import { recordCacheBusMetrics } from '../platform/events/cacheBusMetrics.js';
import { peopleRecurringActions, peopleScheduledHandlers } from '../modules/people/index.js';
import { mediaRecurringActions, mediaScheduledHandlers } from '../modules/media/index.js';
import { auditRecurringActions, auditRetentionHandlers } from '../platform/audit/retention.js';
import { identityRecurringActions, identityRetentionHandlers } from '../platform/identity/retention.js';

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
    ...contentScheduledHandlers,
    ...peopleScheduledHandlers,
    ...mediaScheduledHandlers,
    ...auditRetentionHandlers,
    ...identityRetentionHandlers,
  ]);
  for (const action of [...authRecurringActions, ...idempotencyRecurringActions, ...auditRecurringActions, ...identityRecurringActions]) {
    await ensureRecurring({ ...action, registry, clock });
  }
  const syncEvents = createEventRecurringSync({
    registry,
    actions: [...lostPersonRecurringActions, ...visitorRecurringActions, ...peopleRecurringActions, ...mediaRecurringActions],
    clock,
  });
  await syncEvents();
  return startSchedulerWorker({
    registry,
    clock,
    workerId,
    beforeClaim: async () => {
      recordCacheBusMetrics();
      await syncEvents();
    },
    afterActions: () => deliverAnnouncementBatch({ workerId, clock }),
  });
}
