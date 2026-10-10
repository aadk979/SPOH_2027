import { z } from 'zod';
import { defineScheduledHandler } from '../scheduler/handler.js';
import { requirePlatformSystemAction } from '../scheduler/systemAuthority.js';
import { writeAudit } from './index.js';

/** The database owner fixes the deadline; the app cannot shorten or directly delete history. */
export const auditRetentionHandlers = [defineScheduledHandler({
  type: 'retention.audit', schema: z.object({}).strict(), authorize: requirePlatformSystemAction,
  run: async ({ tx, audit }) => {
    const rows = await tx.$queryRaw<{ removed: number }[]>`SELECT public.prune_expired_audit() AS removed`;
    const removed = rows[0]?.removed ?? 0;
    if (removed) await writeAudit(tx, { ...audit, action: 'audit.prune', entityType: 'AuditLog',
      entityId: null, after: { removed, retentionDays: 400 } });
  },
})];
export const auditRecurringActions = [{ type: 'retention.audit', intervalSeconds: 86400 }] as const;
