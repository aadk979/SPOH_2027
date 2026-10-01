import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../platform/http/auditContext.js';
import { logger } from '../../../platform/logger/index.js';
import {
  deleteAllRecords,
  deleteDueRecords,
  findClosedEvents,
  listFieldRows,
  purgeFieldValues,
  syncPurgeDeadlines,
} from '../data/repo.js';
import { expiredFields } from '../domain/visitorRules.js';

/** One closed event: each field past its retention is removed from every record. */
async function purgeEvent(scope: EventScope, closedAt: Date, now: Date): Promise<number> {
  // P10's close transition will stamp these immediately. This also catches
  // older rows and retention edits before each run, with no visitor values in logs.
  await prisma.$transaction((tx) => syncPurgeDeadlines(tx, scope, closedAt));
  const expired = expiredFields(await listFieldRows(scope), closedAt, now);
  let cleared = 0;
  for (const field of expired) {
    cleared += await prisma.$transaction(async (tx) => {
      const count = await purgeFieldValues(tx, scope, field.code);
      if (count > 0) {
        await writeAudit(tx, {
          ...SYSTEM_AUDIT_CONTEXT,
          eventId: scope.eventId,
          action: 'visitor.purge',
          entityType: 'VisitorField',
          entityId: field.id,
          after: { field: field.code, records: count, reason: 'retention' },
        });
      }
      return count;
    });
  }
  cleared += await prisma.$transaction((tx) => deleteDueRecords(tx, scope, now));
  return cleared;
}

/**
 * The retention handler (ADR-003 §8): a field's values go its retentionDays
 * after the event closes. Idempotent, audited with counts, and it never
 * touches a registration. P10.7 moves it onto the job table.
 */
export async function purgeVisitorData(now: Date = new Date()): Promise<number> {
  let cleared = 0;
  for (const event of await findClosedEvents()) {
    try {
      cleared += await purgeEvent({ eventId: event.id }, event.closedAt, now);
    } catch (error) {
      logger.error({ err: error, eventId: event.id }, 'visitor data purge failed for an event');
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
