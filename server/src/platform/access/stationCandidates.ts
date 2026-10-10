import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import type { ResourceRef } from './authorizer/index.js';

/**
 * Candidates for a question about station-level work in general: the member's assigned
 * stations, or, with none, one station of the event. Asked as "any of them", this is "may
 * this member do this at some station at all"; the use case narrows what it touches.
 */
export async function stationCandidates(
  db: PrismaTransactionClient,
  scope: EventScope,
  membershipId: string,
): Promise<ResourceRef[]> {
  const assigned = await db.shiftAssignment.findMany({
    where: { eventId: scope.eventId, membershipId },
    select: { stationId: true },
    distinct: ['stationId'],
    orderBy: { stationId: 'asc' },
  });
  const ids = assigned.map((row) => row.stationId);
  if (ids.length === 0) {
    const first = await db.station.findFirst({
      where: { eventId: scope.eventId },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (first) ids.push(first.id);
  }
  return ids.map((id) => ({ type: 'Station', id }));
}
