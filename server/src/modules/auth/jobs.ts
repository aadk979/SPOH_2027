import type { ScheduledJob } from '../../platform/scheduler/index.js';
import { pruneRefreshSessions } from './application/pruneSessions.js';

/**
 * Expired and long-revoked sessions. This is the table that grows fastest,
 * because every silent refresh writes a row.
 */
export const authJobs: readonly ScheduledJob[] = [
  {
    name: 'refresh session prune',
    intervalMs: 24 * 60 * 60 * 1000,
    run: () => pruneRefreshSessions(),
  },
];
