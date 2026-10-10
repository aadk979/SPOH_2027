import { z } from 'zod';
import { defineScheduledHandler } from '../scheduler/handler.js';
import { requirePlatformSystemAction } from '../scheduler/systemAuthority.js';
import { writeAudit } from '../audit/index.js';

export const identityRetentionHandlers = [defineScheduledHandler({
  type: 'retention.identity', schema: z.object({}).strict(), authorize: requirePlatformSystemAction,
  run: async ({ tx, now, audit }) => {
    const subscriptions = await tx.pushSubscription.deleteMany({ where: {
      lastSeenAt: { lt: new Date(now.getTime() - 90 * 86400000) },
    } });
    const quota = await tx.identityDeliveryQuota.deleteMany({ where: { expiresAt: { lt: now } } });
    await tx.refreshSession.updateMany({ where: { providerTokenExpiresAt: { lte: now } },
      data: { providerTokenEncrypted: null, providerTokenExpiresAt: null } });
    await tx.authHandoff.deleteMany({ where: { expiresAt: { lte: now } } });
    if (subscriptions.count || quota.count) await writeAudit(tx, { ...audit,
      action: 'identity.prune', entityType: 'PushSubscription', entityId: null,
      after: { subscriptions: subscriptions.count, quotaWindows: quota.count } });
  },
})];
export const identityRecurringActions = [{ type: 'retention.identity', intervalSeconds: 60 }] as const;
