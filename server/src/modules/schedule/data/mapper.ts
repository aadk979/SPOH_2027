import { ScheduleError, ScheduleTimelineRecord, type ScheduleKind } from '@spoh/shared';
import type { TimelineRow } from './repo.js';

const KINDS: Readonly<Record<string, ScheduleKind>> = {
  'event.transition': 'LIFECYCLE',
  'announcement.publish': 'ANNOUNCEMENT',
  'setting.apply': 'SETTING',
  'taxonomy.setActive': 'CAPTURE_CATEGORY',
  'report.snapshot': 'REPORT',
  'lostPerson.purge': 'LOST_PERSON_PURGE',
  'visitor.purge': 'VISITOR_PURGE',
  'session.prune': 'SESSION_PRUNE',
  'idempotency.prune': 'REPLAY_PRUNE',
};

export function toTimelineRecord(row: TimelineRow, personId: string) {
  const error = ScheduleError.safeParse(row.lastError);
  return ScheduleTimelineRecord.parse({
    id: row.id,
    eventId: row.eventId,
    kind: Object.hasOwn(KINDS, row.type) ? KINDS[row.type] : 'OTHER',
    scheduledFor: (row.scheduledFor ?? row.runAt).toISOString(),
    runAt: row.runAt.toISOString(),
    status: row.status,
    version: row.version,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    recurring: row.recurrence !== null,
    createdByYou: row.createdByPersonId === personId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError === null ? null : error.success ? error.data : 'EXECUTION_FAILED',
  });
}
