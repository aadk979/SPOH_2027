import { z } from 'zod';
import { defineScheduledHandler } from '../scheduler/handler.js';
import { requirePlatformSystemAction } from '../scheduler/systemAuthority.js';
import { pruneReplayInTransaction } from './prune.js';
import { pruneExpiredCounters } from '../http/quotaCounterRepo.js';

export const idempotencyScheduledHandlers = [
  defineScheduledHandler({
    type: 'quota.prune',
    schema: z.object({}).strict(),
    authorize: requirePlatformSystemAction,
    run: async ({ tx, now }) => {
      await pruneExpiredCounters(tx, { before: now, limit: 1000 });
    },
  }),
  defineScheduledHandler({
    type: 'idempotency.prune',
    schema: z.object({}).strict(),
    authorize: requirePlatformSystemAction,
    run: async ({ tx, now, audit }) => {
      await pruneReplayInTransaction(tx, { now, audit });
    },
  }),
];
export const idempotencyRecurringActions = [
  { type: 'quota.prune', intervalSeconds: 600 },
  { type: 'idempotency.prune', intervalSeconds: 24 * 3600 },
] as const;
