import type { ReadContext } from '../../../platform/access/currentRead.js';
import { readableStationIds } from '../../../platform/access/readStations.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { dashboardStationCount } from '../data/rosterReadRepo.js';
export interface DashboardRosterAccess { stationIds: readonly string[]; availability: 'available' | 'partial' | 'denied' }
function assertReaderScope(scope: EventScope, reader: ReadContext): void {
  if (reader.scope.eventId !== scope.eventId) throw new ForbiddenError('The dashboard reader belongs to another event.');
}
/** Named rows never use a caller-supplied station allowlist as an authorization decision. */
export async function dashboardRosterAccess(scope: EventScope, reader?: ReadContext): Promise<DashboardRosterAccess> {
  if (!reader) return { stationIds: [], availability: 'denied' };
  assertReaderScope(scope, reader);
  const stationIds = await readableStationIds(reader, 'Roster.ReadStation');
  const count = await dashboardStationCount(scope, reader.db);
  const availability = stationIds.length === 0 ? 'denied' : stationIds.length === count ? 'available' : 'partial';
  return { stationIds, availability };
}
export async function stationRosterAccess(scope: EventScope, input: { stationId: string; reader?: ReadContext }): Promise<boolean> {
  if (!input.reader) return false;
  assertReaderScope(scope, input.reader);
  return input.reader.canRead({ action: 'Roster.ReadStation', resource: { type: 'Station', id: input.stationId } });
}
