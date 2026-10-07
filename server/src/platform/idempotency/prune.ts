import { writeAudit, type AuditContext } from '../audit/index.js';
import type { PrismaTransactionClient } from '../db/client.js';
import { SETTINGS } from '../settings/registry.js';

const DAY = 86_400_000;
const definition = SETTINGS.idempotencyRetentionDays;

/** A stored policy, or the registry default when absent or invalid. */
function daysOf(value: unknown): number {
  const parsed = definition.schema.safeParse(value ?? definition.default);
  return parsed.success ? parsed.data : definition.default;
}

/**
 * Each organisation's own retention (platform scope, D-17), read in the
 * transaction rather than from a cache. No organisation's policy is applied to
 * another's records.
 */
async function organisationPolicies(
  tx: PrismaTransactionClient,
): Promise<Array<{ organisationId: string; days: number }>> {
  const organisations = await tx.organisation.findMany({
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const rows = await tx.setting.findMany({
    where: {
      scope: 'PLATFORM',
      eventId: null,
      key: 'idempotencyRetentionDays',
      scopeId: { in: organisations.map(({ id }) => id) },
    },
    select: { scopeId: true, value: true },
  });
  const stored = new Map(rows.map((row) => [row.scopeId, row.value]));
  return organisations.map(({ id }) => ({ organisationId: id, days: daysOf(stored.get(id)) }));
}

/**
 * Expired replay bodies, count-only audit and scheduler completion share the
 * supplied transaction. A record written inside an event expires by its
 * organisation's policy; one written outside any event (a platform action)
 * keeps the registry default.
 */
export async function pruneReplayInTransaction(
  tx: PrismaTransactionClient,
  input: { now: Date; audit: AuditContext },
): Promise<number> {
  const cutoff = (days: number) => new Date(input.now.getTime() - days * DAY);
  const organisations = [];
  for (const policy of await organisationPolicies(tx)) {
    const { count } = await tx.idempotencyRecord.deleteMany({
      where: {
        createdAt: { lt: cutoff(policy.days) },
        event: { organisationId: policy.organisationId },
      },
    });
    // Count-only: no organisation id or record key reaches the audit row.
    if (count > 0) organisations.push({ retentionDays: policy.days, removed: count });
  }
  const platform = await tx.idempotencyRecord.deleteMany({
    where: { eventId: null, createdAt: { lt: cutoff(definition.default) } },
  });
  const removed = platform.count + organisations.reduce((sum, row) => sum + row.removed, 0);
  if (removed > 0) {
    await writeAudit(tx, {
      ...input.audit,
      action: 'idempotency.prune',
      entityType: 'IdempotencyRecord',
      entityId: null,
      after: {
        removed,
        platform: { retentionDays: definition.default, removed: platform.count },
        organisations,
      },
    });
  }
  return removed;
}
