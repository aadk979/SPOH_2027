/**
 * The station module's public API: the only file another module may import
 * (engineering-standards §3, modules/README.md).
 *
 * Reads that a use case would only forward are exported from the data layer
 * directly, rather than wrapped in a pass-through.
 */
export { stationRouter } from './http/routes.js';
export { listActiveStations } from './application/listActiveStations.js';
export { requireActiveStation } from './application/requireActiveStation.js';
export { requireCountedStation } from './application/requireCountedStation.js';
export {
  findStationById,
  listCountedStations,
  listStampingStations,
  listStations,
  type Station,
} from './data/repo.js';
export { toStationSummary } from './data/mappers.js';
