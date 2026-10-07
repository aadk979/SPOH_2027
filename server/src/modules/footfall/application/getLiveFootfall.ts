import type { FootfallLiveResponse } from '@spoh/shared';
import { SETTINGS } from '../../../platform/settings/registry.js';
import {
  prepareThresholds,
  type ThresholdSnapshot,
} from '../../../platform/settings/thresholds.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import { listCountedStations } from '../../station/index.js';
import { liveStationStats } from '../data/repo.js';
import { liveStationRow } from '../domain/footfallRules.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { systemClock } from '../../../platform/time/index.js';

/**
 * A station silent for longer than this during event hours is flagged. The
 * live value resolves per station (station, event, platform, default) from the
 * scoped settings store; this is the shipped default, kept as a
 * named constant because it documents the configuration and gives tests a
 * stable reference.
 */
export const SILENT_STATION_MINUTES = SETTINGS.silentStationMinutes.default;

/**
 * Live counts with a silence flag per station. Every counted room appears, even
 * one with no ticks at all — a station missing from the list would be a station
 * nobody notices has stopped (PRODUCT_BRIEF §9).
 */
export async function getLiveFootfall(
  scope: ReportingScope,
  now = systemClock.now(),
  options: { thresholds?: ThresholdSnapshot } = {},
): Promise<FootfallLiveResponse> {
  const thresholds = options.thresholds ?? (await prepareThresholds(scope));
  const since = await eventTodayStart(scope, now);
  const [stations, stats] = await Promise.all([
    listCountedStations(scope),
    liveStationStats(scope, { since, until: now }),
  ]);
  const statsByStation = new Map(stats.map((row) => [row.stationId, row]));

  return {
    rehearsalIncluded: scope.includeRehearsal ?? false,
    unit: 'roomEntries',
    asOf: now.toISOString(),
    stations: stations.map((station) =>
      liveStationRow(station, statsByStation.get(station.id), {
        now,
        silentAfterMinutes: thresholds.silentStationMinutes(station.id),
      }),
    ),
  };
}
