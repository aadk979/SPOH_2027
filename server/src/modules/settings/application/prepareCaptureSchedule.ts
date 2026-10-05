import { ERROR_CODES, type CaptureScheduleIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved } from '../../../platform/idempotency/index.js';
import { storedSetting } from '../../../platform/settings/scopedStore.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { holdScopedMutationStation } from '../data/scopedMutationRepo.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';

export type CaptureScheduleActor = ActorContext & { clock?: Clock };
export async function prepareCaptureSchedule(
  tx: PrismaTransactionClient,
  input: { intent: CaptureScheduleIntent; actor: CaptureScheduleActor; idempotencyKey: string },
) {
  const { actor, intent } = input;
  await lockEventSettingAuthority(tx, actor);
  const event = await holdCaptureEvent(tx, actor.scope);
  if (event.status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.SETTING_LOCKED, 'Archived event settings are read-only.');
  if (
    intent.target.scope === 'station' &&
    !(await holdScopedMutationStation(tx, actor.scope, intent.target.stationId))
  )
    throw new NotFoundError('Station');
  await lockReserved(tx, actor.scope, input.idempotencyKey);
  const now = (actor.clock ?? systemClock).now();
  if (new Date(intent.runAt).getTime() <= now.getTime())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Choose a future capture change time.');
  const target =
    intent.target.scope === 'event'
      ? { scope: 'event' as const, eventId: actor.scope.eventId }
      : {
          scope: 'station' as const,
          eventId: actor.scope.eventId,
          stationId: intent.target.stationId,
        };
  const stored = await storedSetting(target, intent.key, tx);
  if ((stored?.version ?? 0) !== intent.expectedVersion)
    throw new ConflictError(
      ERROR_CODES.SETTING_VERSION_CONFLICT,
      'Capture changed. Review its current version before scheduling again.',
    );
  return { event, now };
}
