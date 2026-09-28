import { logger } from '../logger/index.js';
import type { ScheduledJob } from '../scheduler/index.js';
import { pruneIdempotencyRecords } from './index.js';

export const idempotencyJobs: readonly ScheduledJob[] = [
  {
    name: 'idempotency prune',
    intervalMs: 24 * 60 * 60 * 1000,
    async run() {
      const removed = await pruneIdempotencyRecords();
      if (removed > 0) logger.info({ removed }, 'pruned expired idempotency records');
    },
  },
];
