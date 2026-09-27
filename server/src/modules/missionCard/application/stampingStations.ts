import { listStampingStations } from '../../station/index.js';

/** The stations a journey visits; a card stamped at all of them is complete. */
export async function stampingStationIds(): Promise<string[]> {
  const stations = await listStampingStations();
  return stations.map((station) => station.id);
}
