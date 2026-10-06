import { CategoryActivityRecord, CategoryScheduleRecord, ScheduleError } from '@spoh/shared';
import { supportedCategorySchedule } from '../domain/categoryScheduleProvenance.js';
import type { CategoryActivityRow } from './categoryReadRepo.js';
import type { CategoryScheduleAuditRow } from './categoryScheduleAuditRepo.js';
import type { CategoryScheduleRow } from './categoryScheduleRepo.js';

export function toCategoryActivity(row: CategoryActivityRow) {
  const { createdAt: _created, updatedAt, ...record } = row;
  return CategoryActivityRecord.parse({ ...record, updatedAt: updatedAt.toISOString() });
}
export function toCategorySchedule(
  row: CategoryScheduleRow,
  input: { personId: string; audits: CategoryScheduleAuditRow[] },
) {
  const definition = supportedCategorySchedule(
    row,
    input.audits.filter((audit) => audit.entityId === row.id),
  );
  if (!definition) return null;
  const { runAt: _due, ...intent } = definition.intent;
  const error = ScheduleError.safeParse(row.lastError);
  const parsed = CategoryScheduleRecord.safeParse({
    ...intent,
    id: row.id,
    eventId: row.eventId,
    kind: 'CAPTURE_CATEGORY',
    runAt: row.runAt.toISOString(),
    scheduledFor: (row.scheduledFor ?? row.runAt).toISOString(),
    status: row.status,
    version: row.version,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    recurring: false,
    createdByYou: row.createdByPersonId === input.personId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError === null ? null : error.success ? error.data : 'EXECUTION_FAILED',
  });
  return parsed.success ? parsed.data : null;
}
