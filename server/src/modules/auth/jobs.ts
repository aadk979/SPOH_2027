import { z } from 'zod';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { requirePlatformSystemAction } from '../../platform/scheduler/systemAuthority.js';
import { pruneSessionsInTransaction } from './application/pruneSessions.js';

/**
 * Expired and long-revoked sessions. This is the table that grows fastest,
 * because every silent refresh writes a row.
 */
export const authScheduledHandlers = [
  defineScheduledHandler({
    type: 'session.prune',
    schema: z.object({}).strict(),
    authorize: requirePlatformSystemAction,
    run: async ({ tx, now, audit }) => {
      await pruneSessionsInTransaction(tx, { now, audit });
    },
  }),
];
export const authRecurringActions = [
  { type: 'session.prune', intervalSeconds: 24 * 3600 },
] as const;
