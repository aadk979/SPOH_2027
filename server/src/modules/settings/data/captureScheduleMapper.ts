import { z } from 'zod';
import { CaptureScheduleIntent, CaptureScheduleRecord, Id, ScheduleError } from '@spoh/shared';
import type { CaptureScheduleRow } from './captureScheduleRepo.js';

const Payload = CaptureScheduleIntent.omit({ target: true, runAt: true })
  .extend({
    scope: z.enum(['event', 'station']),
    scopeId: Id,
  })
  .strict();
export function captureScheduleIntent(row: CaptureScheduleRow) {
  const payload = Payload.safeParse(row.payload);
  if (
    !payload.success ||
    !row.createdByPersonId ||
    row.recurrence !== null ||
    row.dedupeKey !== null ||
    (payload.data.scope === 'event' && payload.data.scopeId !== row.eventId)
  )
    return null;
  const { scope, scopeId, ...intent } = payload.data;
  const parsed = CaptureScheduleIntent.safeParse({
    ...intent,
    target: scope === 'event' ? { scope } : { scope, stationId: scopeId },
    runAt: (row.scheduledFor ?? row.runAt).toISOString(),
  });
  return parsed.success ? parsed.data : null;
}
/** A creation audit proves supported provenance even after definition edits. */
export function supportedCaptureIntent(row: CaptureScheduleRow, original: unknown) {
  const intent = captureScheduleIntent(row);
  const creation = CaptureScheduleIntent.safeParse(original);
  if (
    !intent ||
    !creation.success ||
    JSON.stringify(intent.target) !== JSON.stringify(creation.data.target)
  )
    return null;
  return intent;
}
export function toCaptureSchedule(row: CaptureScheduleRow, personId: string) {
  const intent = captureScheduleIntent(row);
  if (!intent) return null;
  const error = ScheduleError.safeParse(row.lastError);
  const parsed = CaptureScheduleRecord.safeParse({
    ...intent,
    id: row.id,
    eventId: row.eventId,
    kind: 'SETTING',
    runAt: row.runAt.toISOString(),
    scheduledFor: (row.scheduledFor ?? row.runAt).toISOString(),
    status: row.status,
    version: row.version,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    recurring: false,
    createdByYou: row.createdByPersonId === personId,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError === null ? null : error.success ? error.data : 'EXECUTION_FAILED',
  });
  return parsed.success ? parsed.data : null;
}
