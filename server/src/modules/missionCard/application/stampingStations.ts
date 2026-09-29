import { listStampingStations } from '../../station/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The stations a journey visits; a card stamped at all of them is complete. */
export async function stampingStationIds(scope: EventScope): Promise<string[]> {
  const stations = await listStampingStations(scope);
  return stations.map((station) => station.id);
}
