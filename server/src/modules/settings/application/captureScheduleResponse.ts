import {
  CaptureScheduleIntent,
  CaptureScheduleRecord,
  CaptureScheduleResponse,
  ScheduleError,
} from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { CaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { CaptureScheduleRow } from '../data/captureScheduleRepo.js';
import { holdScopedMutationStation } from '../data/scopedMutationRepo.js';
import { captureSettingPayload } from '../jobs.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';
import { scopedReadResponse } from './scopedReadResponse.js';

function captureIntent(row: CaptureScheduleRow) {
  const payload = captureSettingPayload.safeParse(row.payload);
  if (
    !payload.success ||
    !row.createdByPersonId ||
    (payload.data.scope === 'event' && payload.data.scopeId !== row.eventId)
  )
    throw new NotFoundError('Capture schedule');
  const parsed = CaptureScheduleIntent.safeParse({
    target:
      payload.data.scope === 'event'
        ? { scope: 'event' }
        : { scope: 'station', stationId: payload.data.scopeId },
    key: payload.data.key,
    value: payload.data.value,
    expectedVersion: payload.data.expectedVersion,
    reason: payload.data.reason,
    runAt: (row.scheduledFor ?? row.runAt).toISOString(),
  });
  if (!parsed.success) throw new NotFoundError('Capture schedule');
  return parsed.data;
}

function toCaptureSchedule(row: CaptureScheduleRow, personId: string) {
  const intent = captureIntent(row);
  const error = ScheduleError.safeParse(row.lastError);
  return CaptureScheduleRecord.parse({
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
}

/** Invalid stored payloads are unavailable rather than leaked through a generic job reader. */
export async function captureScheduleResponse(
  tx: PrismaTransactionClient,
  input: { row: CaptureScheduleRow; actor: CaptureScheduleActor; event: CaptureEvent },
) {
  const { row, actor, event } = input;
  const schedule = toCaptureSchedule(row, actor.volunteerId);
  if (
    schedule.target.scope === 'station' &&
    !(await holdScopedMutationStation(tx, actor.scope, schedule.target.stationId))
  )
    throw new NotFoundError('Station');
  return CaptureScheduleResponse.parse({
    schedule,
    current: await scopedReadResponse(tx, { query: schedule.target, actor, event }),
  });
}
