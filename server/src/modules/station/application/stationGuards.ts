import { ERROR_CODES, type StationSummary } from '@spoh/shared';
import { AppError, NotFoundError } from '../../../platform/errors/index.js';
import type { Station } from '../../../generated/prisma/client.js';
import { findStationById, listStations, toStationSummary } from '../data/repo.js';

export async function getActiveStations(): Promise<StationSummary[]> {
  const stations = await listStations();
  return stations.map(toStationSummary);
}

/**
 * Resolve a station for a capture write.
 *
 * Rejecting an inactive station here rather than at the database keeps the
 * failure legible: a volunteer whose station was closed mid-shift gets a clear
 * message instead of a foreign-key error.
 */
export async function requireActiveStation(stationId: string): Promise<Station> {
  const station = await findStationById(stationId);
  if (!station) throw new NotFoundError('Station');

  if (!station.active) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_INACTIVE,
      `${station.name} is no longer active. Check with your IC before recording here.`,
    );
  }

  return station;
}

/**
 * Footfall may only be recorded for a room that is actually counted. Silently
 * accepting a tick for an uncounted station would put entries into a total
 * nobody expects them in (PRODUCT_BRIEF §0.1).
 */
export async function requireCountedStation(stationId: string): Promise<Station> {
  const station = await requireActiveStation(stationId);

  if (!station.countsEntry) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_DOES_NOT_COUNT_ENTRY,
      `${station.name} is not a footfall-counted room.`,
    );
  }

  return station;
}
