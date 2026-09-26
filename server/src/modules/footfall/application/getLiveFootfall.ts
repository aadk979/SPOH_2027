import type { FootfallLiveResponse } from '@spoh/shared';
import { DEFAULT_SETTINGS, getSettings } from '../../../platform/settings/index.js';
import { startOfEventDay } from '../../../platform/time/index.js';
import { listCountedStations } from '../../station/index.js';
import { liveStationStats } from '../data/repo.js';
import { liveStationRow } from '../domain/footfallRules.js';

/**
 * A station silent for longer than this during event hours is flagged. The
 * live value is a runtime setting; this is the shipped default, kept as a
 * named constant because it documents the configuration and gives tests a
 * stable reference.
 */
export const SILENT_STATION_MINUTES = DEFAULT_SETTINGS.silentStationMinutes;

/**
 * Live counts with a silence flag per station. Every counted room appears, even
 * one with no ticks at all — a station missing from the list would be a station
 * nobody notices has stopped (PRODUCT_BRIEF §9).
 */
export async function getLiveFootfall(now = new Date()): Promise<FootfallLiveResponse> {
  const silentAfterMinutes = getSettings().silentStationMinutes;
  const [stations, stats] = await Promise.all([
    listCountedStations(),
    liveStationStats(startOfEventDay(now), now),
  ]);
  const statsByStation = new Map(stats.map((row) => [row.stationId, row]));

  return {
    unit: 'roomEntries',
    asOf: now.toISOString(),
    stations: stations.map((station) =>
      liveStationRow(station, statsByStation.get(station.id), { now, silentAfterMinutes }),
    ),
  };
}
