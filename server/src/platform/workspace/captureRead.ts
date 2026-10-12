import type { ReadContext } from '../access/currentRead.js';
import { ForbiddenError } from '../errors/index.js';
import { readableCollectionStations, requireSelfRead } from './sourceRead.js';

/** Recorder filters are private facets even when aggregate station counts are public to this reader. */
export async function captureStations(context: ReadContext, filter: { stationId?: string; personId?: string }) {
  const ids = await readableCollectionStations(context, 'Dashboard.ReadStation', filter.stationId);
  if (!filter.personId) return ids;
  if (filter.personId === context.personId) { await requireSelfRead(context); return ids; }
  if (await context.canRead({ action: 'People.Read', resource: { type: 'Event', id: context.scope.eventId } })) return ids;
  const privateIds: string[] = [];
  for (const id of ids) {
    if (await context.canRead({ action: 'Roster.ReadStation', resource: { type: 'Station', id } })) privateIds.push(id);
  }
  if (!privateIds.length) throw new ForbiddenError('You cannot read this recorder facet.');
  return privateIds;
}
