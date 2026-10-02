import { z } from 'zod';
import { defineScheduledHandler } from '../scheduler/handler.js';
import { requirePlatformSystemAction } from '../scheduler/systemAuthority.js';
import { pruneReplayInTransaction } from './prune.js';

export const idempotencyScheduledHandlers = [
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
  { type: 'idempotency.prune', intervalSeconds: 24 * 3600 },
] as const;
