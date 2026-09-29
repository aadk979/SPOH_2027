import type { StationSummary } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toStationSummary } from '../data/mappers.js';
import { listStations } from '../data/repo.js';

/** Every station, inactive ones included, for the configuration screen. */
export async function listAllStations(scope: EventScope): Promise<StationSummary[]> {
  return (await listStations(scope, { includeInactive: true })).map(toStationSummary);
}
