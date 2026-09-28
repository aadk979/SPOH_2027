import { authJobs } from '../modules/auth/index.js';
import { lostPersonJobs } from '../modules/lostPerson/index.js';
import { idempotencyJobs } from '../platform/idempotency/jobs.js';
import type { ScheduledJob } from '../platform/scheduler/index.js';
import { settingsJobs } from '../platform/settings/jobs.js';

/** Every scheduled job the server runs, in the order they are started. */
export const JOBS: readonly ScheduledJob[] = [
  ...lostPersonJobs,
  ...idempotencyJobs,
  ...authJobs,
  ...settingsJobs,
];
