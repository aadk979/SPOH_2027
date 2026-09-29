import type { StationSummary } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toStationSummary } from '../data/mappers.js';
import { listStations } from '../data/repo.js';

/** The station list every signed-in person reads: the map legend. */
export async function listActiveStations(scope: EventScope): Promise<StationSummary[]> {
  const stations = await listStations(scope);
  return stations.map(toStationSummary);
}
