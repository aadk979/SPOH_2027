import type { ScheduledJob } from '../scheduler/index.js';
import { invalidateVolunteerCache } from './index.js';

/** A full identity-cache refresh every minute backs up missed notifications. */
export const identityCacheJobs: readonly ScheduledJob[] = [
  {
    name: 'identity cache refresh',
    intervalMs: 60_000,
    run: async () => invalidateVolunteerCache(),
  },
];
