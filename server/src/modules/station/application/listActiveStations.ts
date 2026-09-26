import type { StationSummary } from '@spoh/shared';
import { toStationSummary } from '../data/mappers.js';
import { listStations } from '../data/repo.js';

/** The station list every signed-in person reads: the map legend. */
export async function listActiveStations(): Promise<StationSummary[]> {
  const stations = await listStations();
  return stations.map(toStationSummary);
}
