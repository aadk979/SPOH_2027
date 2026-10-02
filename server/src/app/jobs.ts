import { lostPersonJobs } from '../modules/lostPerson/index.js';
import { idempotencyJobs } from '../platform/idempotency/jobs.js';
import type { ScheduledJob } from '../platform/scheduler/index.js';
import { settingsJobs } from '../platform/settings/jobs.js';
import { identityCacheJobs } from '../platform/identity/jobs.js';
import { visitorJobs } from '../modules/visitor/index.js';

/** Every scheduled job the server runs, in the order they are started. */
export const JOBS: readonly ScheduledJob[] = [
  ...lostPersonJobs,
  ...idempotencyJobs,
  ...settingsJobs,
  ...identityCacheJobs,
  ...visitorJobs,
];
