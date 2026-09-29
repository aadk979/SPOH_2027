import type { CommitteeRole, ShiftAssignmentRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import { isRosteredAt, listAssignmentsForStation, stationExists } from '../data/repo.js';
import { assertMayReadRoster } from '../domain/rosterVisibility.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Who is rostered at a station, optionally on one day. */
export async function getStationRoster(
  query: { stationId: string; eventDayId?: string | undefined },
  viewer: { scope: EventScope; membershipId: string; role: CommitteeRole },
): Promise<ShiftAssignmentRecord[]> {
  const { stationId, eventDayId } = query;
  const { scope } = viewer;
  if (!(await stationExists(scope, stationId))) throw new NotFoundError('Station');
  const rosteredThere =
    viewer.role === 'IC' &&
    (await isRosteredAt(scope, { membershipId: viewer.membershipId, stationId }));
  assertMayReadRoster(viewer, rosteredThere);
  const assignments = await listAssignmentsForStation(scope, { stationId, eventDayId });
  return assignments.map(toAssignmentRecord);
}
