import { ERROR_CODES, type CaptureScheduleIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { storedSetting } from '../../../platform/settings/scopedStore.js';

/** Run only after all policy, target, action and reservation waits have settled. */
export async function reviewCaptureScheduleIntent(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; intent: CaptureScheduleIntent; now: Date },
) {
  const { scope, intent, now } = input;
  if (new Date(intent.runAt).getTime() <= now.getTime())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Choose a future capture change time.');
  const target =
    intent.target.scope === 'event'
      ? { scope: 'event' as const, eventId: scope.eventId }
      : { scope: 'station' as const, eventId: scope.eventId, stationId: intent.target.stationId };
  const stored = await storedSetting(target, intent.key, tx);
  if ((stored?.version ?? 0) !== intent.expectedVersion)
    throw new ConflictError(
      ERROR_CODES.SETTING_VERSION_CONFLICT,
      'Capture changed. Review its current version before scheduling again.',
    );
}
