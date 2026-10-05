import { CaptureScheduleResponse } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { CaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toCaptureSchedule } from '../data/captureScheduleMapper.js';
import type { CaptureScheduleRow } from '../data/captureScheduleRepo.js';
import { holdScopedMutationStation } from '../data/scopedMutationRepo.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';
import { scopedReadResponse } from './scopedReadResponse.js';

/** Invalid stored payloads are unavailable rather than leaked through a generic job reader. */
export async function captureScheduleResponse(
  tx: PrismaTransactionClient,
  input: { row: CaptureScheduleRow; actor: CaptureScheduleActor; event: CaptureEvent },
) {
  const { row, actor, event } = input;
  const schedule = toCaptureSchedule(row, actor.volunteerId);
  if (!schedule) throw new NotFoundError('Capture schedule');
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
