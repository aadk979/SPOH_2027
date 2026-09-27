import type { StationSummary } from '@spoh/shared';
import { toStationSummary } from '../data/mappers.js';
import { listStations } from '../data/repo.js';

/** Every station, inactive ones included, for the configuration screen. */
export async function listAllStations(): Promise<StationSummary[]> {
  return (await listStations({ includeInactive: true })).map(toStationSummary);
}
