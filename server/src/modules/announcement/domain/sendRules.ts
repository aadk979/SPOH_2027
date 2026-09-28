import { roleMeets, type CommitteeRole } from '@spoh/shared';
import { ForbiddenError } from '../../../platform/errors/index.js';

/**
 * An IC may address their own station; only a DC and above may address the
 * whole event or another station. "Their own" is a station they are rostered
 * at today: the rule said so, but the code only refused an IC who named no
 * station, so an IC could push "close the booth" to anyone's (F04-024).
 * Checked in the use case rather than by two separate routes because the
 * distinction is in the payload, not the path — and the capability check on
 * the route cannot see the payload.
 */
export function assertMaySend(
  sender: { role: CommitteeRole; todaysStationIds: readonly string[] },
  stationId: string | null,
): void {
  if (roleMeets(sender.role, 'DEPUTY_COORDINATOR')) return;
  if (!stationId) {
    throw new ForbiddenError(
      'Only a Deputy Coordinator or above may send an event-wide announcement. Target a station instead.',
    );
  }
  if (!sender.todaysStationIds.includes(stationId)) {
    throw new ForbiddenError('You can address only a station you are rostered at today.');
  }
}

/** Lock screens cut mid-word, so the push preview is truncated here. */
export function pushPreview(body: string): string {
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}
