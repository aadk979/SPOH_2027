import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { logger } from '../../../platform/logger/index.js';
import { systemClock } from '../../../platform/time/index.js';
import {
  deleteAllRecords,
  deleteDueRecords,
  findClosedEvents,
  listFieldRows,
  purgeFieldValues,
  syncPurgeDeadlines,
} from '../data/repo.js';
import { expiredFields } from '../domain/visitorRules.js';

/** Fresh locked lifecycle, field policy, values and receipts share the caller's transaction. */
export async function purgeVisitorDataInTransaction(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { now: Date; audit: AuditContext },
): Promise<number> {
  const event = await holdCaptureEvent(tx, scope);
  if (!event.closedAt || !['CLOSED', 'ARCHIVED'].includes(event.status)) return 0;
  await syncPurgeDeadlines(tx, scope, event.closedAt);
  const expired = expiredFields(await listFieldRows(scope, tx), event.closedAt, input.now);
  let cleared = 0;
  for (const field of expired) {
    const count = await purgeFieldValues(tx, scope, field.code);
    if (count > 0) {
      await writeAudit(tx, {
        ...input.audit,
        eventId: scope.eventId,
        action: 'visitor.purge',
        entityType: 'VisitorField',
        entityId: field.id,
        after: { field: field.code, records: count, reason: 'retention' },
      });
    }
    cleared += count;
  }
  const deleted = await deleteDueRecords(tx, scope, input.now);
  if (deleted > 0) {
    await writeAudit(tx, {
      ...input.audit,
      eventId: scope.eventId,
      action: 'visitor.purge',
      entityType: 'VisitorRecord',
      entityId: null,
      after: { records: deleted, reason: 'deadline' },
    });
  }
  return cleared + deleted;
}

/**
 * The retention handler (ADR-003 §8): a field's values go its retentionDays
 * after the event closes. Idempotent, audited with counts, and it never
 * touches a registration. The manual entry point shares the worker's per-event helper.
 */
export async function purgeVisitorData(now: Date = systemClock.now()): Promise<number> {
  let cleared = 0;
  for (const event of await findClosedEvents()) {
    try {
      cleared += await prisma.$transaction(
        (tx) =>
          purgeVisitorDataInTransaction(
            tx,
            { eventId: event.id },
            { now, audit: SYSTEM_AUDIT_CONTEXT },
          ),
        { isolationLevel: 'ReadCommitted', timeout: 30_000 },
      );
    } catch {
      logger.error(
        { code: 'VISITOR_PURGE_FAILED', eventId: event.id },
        'visitor data purge failed for an event',
      );
    }
  }
  return cleared;
}

/** Switching visitor data off removes every record first (ADR-002 §4). */
export async function purgeAllVisitorRecords(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<number> {
  return deleteAllRecords(tx, scope);
}
