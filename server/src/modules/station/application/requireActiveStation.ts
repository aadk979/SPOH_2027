import { NotFoundError } from '../../../platform/errors/index.js';
import { assertStationActive } from '../domain/stationRules.js';
import { findStationById, type Station } from '../data/repo.js';

/** Resolve the station a capture write names, refusing a missing or closed one. */
export async function requireActiveStation(stationId: string): Promise<Station> {
  const station = await findStationById(stationId);
  if (!station) throw new NotFoundError('Station');
  assertStationActive(station);
  return station;
}
