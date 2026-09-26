import { assertStationCountsEntry } from '../domain/stationRules.js';
import type { Station } from '../data/repo.js';
import { requireActiveStation } from './requireActiveStation.js';

/** Resolve the room a footfall tick names: active, and counted. */
export async function requireCountedStation(stationId: string): Promise<Station> {
  const station = await requireActiveStation(stationId);
  assertStationCountsEntry(station);
  return station;
}
