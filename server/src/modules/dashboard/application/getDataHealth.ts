import type { DataHealthResponse } from '@spoh/shared';
import { getSettings } from '../../../platform/settings/index.js';
import {
  activeShiftBlocks,
  minutesBetween,
  startOfEventDay,
} from '../../../platform/time/index.js';
import { getLiveFootfall } from '../../footfall/index.js';
import {
  checkedInWithLastCapture,
  findEventDayOn,
  openFallbackWindowExists,
} from '../data/repo.js';
import { staleDevices as staleDevicesOf } from '../domain/signals.js';
import { flaggedRedemptions } from '../data/flaggedRedemptions.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Data health (PRODUCT_BRIEF §9) — the early warning that a station has quietly
 * stopped recording.
 *
 * This matters more than any server metric. The API can be perfectly healthy
 * while a room counts nothing for an hour, and a total alone would never reveal
 * it. Outside event hours silence is expected, so nothing is flagged.
 */
export async function getDataHealth(
  scope: EventScope,
  now = new Date(),
): Promise<DataHealthResponse> {
  const since = startOfEventDay(now);
  const blocks = activeShiftBlocks(now);
  const withinEventHours = blocks.length > 0;

  const [footfall, fallbackWindowOpen, eventDay, flagged] = await Promise.all([
    getLiveFootfall(scope, now),
    openFallbackWindowExists(now),
    findEventDayOn(since),
    flaggedRedemptions({ since, until: now }),
  ]);

  const silentStations = withinEventHours
    ? footfall.stations
        .filter((station) => station.silent)
        .map((station) => ({
          stationId: station.stationId,
          stationName: station.stationName,
          lastActivityAt: station.lastActivityAt,
          minutesSinceLastActivity: station.minutesSinceLastActivity,
        }))
    : [];

  const staleAfter = getSettings().staleDeviceMinutes;

  const staleDevices =
    withinEventHours && eventDay
      ? staleDevicesOf(
          (
            await checkedInWithLastCapture({ eventDayId: eventDay.id, blocks, since, until: now })
          ).map((row) => ({
            volunteerId: row.volunteerId,
            volunteerName: row.volunteerName,
            stationName: row.stationName,
            lastCaptureAt: row.lastCaptureAt?.toISOString() ?? null,
            minutesSinceLastCapture: row.lastCaptureAt
              ? minutesBetween(row.lastCaptureAt, now)
              : null,
          })),
          staleAfter,
        )
      : [];

  return {
    asOf: now.toISOString(),
    silentStations,
    staleDevices,
    fallbackWindowOpen,
    withinEventHours,
    flaggedRedemptions: flagged,
  };
}
