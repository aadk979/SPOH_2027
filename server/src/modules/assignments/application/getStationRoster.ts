import type { CommitteeRole, ShiftAssignmentRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import { isRosteredAt, listAssignmentsForStation, stationExists } from '../data/repo.js';
import { assertMayReadRoster } from '../domain/rosterVisibility.js';

/** Who is rostered at a station, optionally on one day. */
export async function getStationRoster(
  query: { stationId: string; eventDayId?: string | undefined },
  viewer: { volunteerId: string; role: CommitteeRole },
): Promise<ShiftAssignmentRecord[]> {
  const { stationId, eventDayId } = query;
  if (!(await stationExists(stationId))) throw new NotFoundError('Station');
  const rosteredThere = viewer.role === 'IC' && (await isRosteredAt(viewer.volunteerId, stationId));
  assertMayReadRoster(viewer, rosteredThere);
  const assignments = await listAssignmentsForStation(stationId, eventDayId);
  return assignments.map(toAssignmentRecord);
}
