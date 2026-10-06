import { systemClock } from '../../../platform/time/index.js';
import type { DataHealthResponse } from '@spoh/shared';
import {
  prepareThresholds,
  type ThresholdSnapshot,
} from '../../../platform/settings/thresholds.js';
import { scheduledShifts } from '../../../platform/event/runningShifts.js';
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
  options: { thresholds?: ThresholdSnapshot } = {},
): Promise<DataHealthResponse> {
  const thresholds = options.thresholds ?? (await prepareThresholds(scope));
  const since = await eventTodayStart(scope, now);
  const today = await eventToday(scope, now);
  const withinEventHours = await anyShiftRunning(scope, scheduledShifts(scope, now));

  const [footfall, fallbackWindowOpen, eventDay, flagged] = await Promise.all([
    getLiveFootfall(scope, now, { thresholds }),
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
      ? await staleDevicesFor(scope, {
          eventDayId: eventDay.id,
          since,
          now,
          staleAfterMinutes: thresholds.staleDeviceMinutes(),
        })
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

async function staleDevicesFor(
  scope: ReportingScope,
  input: { eventDayId: string; since: Date; now: Date; staleAfterMinutes: number },
): Promise<DataHealthResponse['staleDevices']> {
  const rows = await checkedInWithLastCapture(scope, {
    eventDayId: input.eventDayId,
    since: input.since,
    until: input.now,
  });
  return staleDevicesOf(
    rows.map((row) => ({
      volunteerId: row.volunteerId,
      volunteerName: row.volunteerName,
      stationName: row.stationName,
      lastCaptureAt: row.lastCaptureAt?.toISOString() ?? null,
      minutesSinceLastCapture: row.lastCaptureAt
        ? minutesBetween(row.lastCaptureAt, input.now)
        : null,
    })),
    input.staleAfterMinutes,
  );
}
