import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { assertStationActive } from '../domain/stationRules.js';
import { findStationById, type Station } from '../data/repo.js';

/**
 * Resolve the station a capture write names, refusing a missing or closed one.
 * A station of another event is missing (ADR-001 §2).
 */
export async function requireActiveStation(scope: EventScope, stationId: string): Promise<Station> {
  const station = await findStationById(scope, stationId);
  if (!station) throw new NotFoundError('Station');
  assertStationActive(station);
  return station;
}
