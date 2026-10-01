import { systemClock } from '../../../platform/time/index.js';
import type { DataHealthResponse } from '@spoh/shared';
import { getSettings } from '../../../platform/settings/index.js';
import { runningShifts } from '../../../platform/event/runningShifts.js';
import { eventToday, eventTodayStart } from '../../../platform/event/today.js';
import { minutesBetween } from '../../../platform/time/index.js';
import { getLiveFootfall } from '../../footfall/index.js';
import {
  anyShiftRunning,
  checkedInWithLastCapture,
  findEventDayOn,
  openFallbackWindowExists,
} from '../data/repo.js';
import { staleDevices as staleDevicesOf } from '../domain/signals.js';
import { flaggedRedemptions } from '../data/flaggedRedemptions.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';

/**
 * Data health (PRODUCT_BRIEF §9) — the early warning that a station has quietly
 * stopped recording.
 *
 * This matters more than any server metric. The API can be perfectly healthy
 * while a room counts nothing for an hour, and a total alone would never reveal
 * it. Outside event hours silence is expected, so nothing is flagged.
 */
export async function getDataHealth(
  scope: ReportingScope,
  now = systemClock.now(),
): Promise<DataHealthResponse> {
  const since = await eventTodayStart(scope, now);
  const today = await eventToday(scope, now);
  const withinEventHours = await anyShiftRunning(scope, await runningShifts(scope, now));

  const [footfall, fallbackWindowOpen, eventDay, flagged] = await Promise.all([
    getLiveFootfall(scope, now),
    openFallbackWindowExists(scope, now),
    findEventDayOn(scope, today),
    flaggedRedemptions(scope, { since, until: now }),
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

  const staleDevices =
    withinEventHours && eventDay
      ? staleDevicesOf(
          (
            await checkedInWithLastCapture(scope, { eventDayId: eventDay.id, since, until: now })
          ).map((row) => ({
            volunteerId: row.volunteerId,
            volunteerName: row.volunteerName,
            stationName: row.stationName,
            lastCaptureAt: row.lastCaptureAt?.toISOString() ?? null,
            minutesSinceLastCapture: row.lastCaptureAt
              ? minutesBetween(row.lastCaptureAt, now)
              : null,
          })),
          getSettings().staleDeviceMinutes,
        )
      : [];

  return {
    rehearsalIncluded: scope.includeRehearsal ?? false,
    asOf: now.toISOString(),
    silentStations,
    staleDevices,
    fallbackWindowOpen,
    withinEventHours,
    flaggedRedemptions: flagged,
  };
}
