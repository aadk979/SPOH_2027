import type { Action } from '@spoh/access-policies';
import type { ReadContext } from './currentRead.js';

/** Candidate IDs are public structure references; private source rows wait for these decisions. */
export async function readableStationIds(context: ReadContext, action: Action): Promise<string[]> {
  const stations = await context.db.station.findMany({
    where: { eventId: context.scope.eventId }, select: { id: true }, orderBy: { id: 'asc' },
  });
  const allowed: string[] = [];
  for (const station of stations) {
    if (await context.canRead({ action, resource: { type: 'Station', id: station.id } })) allowed.push(station.id);
  }
  return allowed;
}
