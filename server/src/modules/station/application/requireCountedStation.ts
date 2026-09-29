import type { EventScope } from '../../../platform/db/eventScope.js';
import { assertStationCountsEntry } from '../domain/stationRules.js';
import type { Station } from '../data/repo.js';
import { requireActiveStation } from './requireActiveStation.js';

/** Resolve the room a footfall tick names: active, and counted by its type. */
export async function requireCountedStation(
  scope: EventScope,
  stationId: string,
): Promise<Station> {
  const station = await requireActiveStation(scope, stationId);
  assertStationCountsEntry({ name: station.name, countsEntry: station.type?.countsEntry ?? false });
  return station;
}
