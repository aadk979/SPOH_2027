import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findStationById } from '../data/repo.js';

/**
 * The station a record optionally names (an incident's, a found item's, a
 * fallback window's): null when it names none, 404 when it names one that is
 * not this event's — a station of another event is a station that does not
 * exist (ADR-001 §2). Closed stations are fine: a report can be about one.
 */
export async function requireEventStation(
  scope: EventScope,
  stationId: string | null | undefined,
): Promise<string | null> {
  if (!stationId) return null;
  if (!(await findStationById(scope, stationId))) throw new NotFoundError('Station');
  return stationId;
}
