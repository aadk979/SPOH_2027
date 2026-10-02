import { writeAudit, type AuditContext } from '../audit/index.js';
import type { PrismaTransactionClient } from '../db/client.js';
import { SETTINGS } from '../settings/registry.js';

/** Read the existing global compatibility policy in the transaction, rather than a stale cache. */
async function replayRetentionDays(tx: PrismaTransactionClient): Promise<number> {
  const row = await tx.appSetting.findUnique({
    where: { key: 'idempotencyRetentionDays' },
    select: { value: true },
  });
  const definition = SETTINGS.idempotencyRetentionDays;
  const parsed = definition.schema.safeParse(row?.value ?? definition.default);
  return parsed.success ? parsed.data : definition.default;
}

/** Expired replay bodies, count-only audit and scheduler completion share the supplied transaction. */
export async function pruneReplayInTransaction(
  tx: PrismaTransactionClient,
  input: { now: Date; audit: AuditContext },
): Promise<number> {
  const days = await replayRetentionDays(tx);
  const cutoff = new Date(input.now.getTime() - days * 86400_000);
  const { count } = await tx.idempotencyRecord.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (count > 0) {
    await writeAudit(tx, {
      ...input.audit,
      action: 'idempotency.prune',
      entityType: 'IdempotencyRecord',
      entityId: null,
      after: { removed: count, retentionDays: days },
    });
  }
  return count;
}
