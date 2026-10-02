import type { ScheduledJob } from '../platform/scheduler/index.js';
import { settingsJobs } from '../platform/settings/jobs.js';
import { identityCacheJobs } from '../platform/identity/jobs.js';

/** Per-instance cache maintenance; business actions use the durable scheduler registry. */
export const JOBS: readonly ScheduledJob[] = [...settingsJobs, ...identityCacheJobs];
