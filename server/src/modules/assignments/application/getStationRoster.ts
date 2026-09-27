import type { ShiftAssignmentRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import { listAssignmentsForStation, stationExists } from '../data/repo.js';

/** Who is rostered at a station, optionally on one day. */
export async function getStationRoster(
  stationId: string,
  eventDayId?: string,
): Promise<ShiftAssignmentRecord[]> {
  if (!(await stationExists(stationId))) throw new NotFoundError('Station');
  const assignments = await listAssignmentsForStation(stationId, eventDayId);
  return assignments.map(toAssignmentRecord);
}
