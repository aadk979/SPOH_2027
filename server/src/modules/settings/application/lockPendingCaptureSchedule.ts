import { ERROR_CODES } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { lockReserved } from '../../../platform/idempotency/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { lockCaptureSchedule } from '../data/captureScheduleMutationRepo.js';
import { findCaptureSchedule } from '../data/captureScheduleRepo.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';
import { requireCaptureSchedule } from './requireCaptureSchedule.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';

/** Event/member/station/action/reservation order matches setting execution; claims may win first. */
export async function lockPendingCaptureSchedule(
  tx: PrismaTransactionClient,
  input: {
    id: string;
    expectedScheduleVersion: number;
    idempotencyKey: string;
    actor: CaptureScheduleActor;
  },
) {
  const { actor } = input;
  await lockEventSettingAuthority(tx, actor);
  const event = await holdCaptureEvent(tx, actor.scope);
  if (event.status === 'ARCHIVED')
    throw new ConflictError(
      ERROR_CODES.SETTING_LOCKED,
      'Archived capture schedules are read-only.',
    );
  await requireCaptureSchedule(tx, {
    scope: actor.scope,
    row: await findCaptureSchedule(tx, actor.scope, input.id),
  });
  const { row, intent } = await requireCaptureSchedule(tx, {
    scope: actor.scope,
    row: await lockCaptureSchedule(tx, actor.scope, input.id),
  });
  if (row.version !== input.expectedScheduleVersion)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The schedule changed. Reload before trying again.',
    );
  if (row.status !== 'PENDING')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Only pending capture schedules can be changed.');
  await lockReserved(tx, actor.scope, input.idempotencyKey);
  return { row, intent, event, now: (actor.clock ?? systemClock).now() };
}
