import type { IncidentRecord, ListIncidentsQuery } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { listIncidents } from '../data/repo.js';
import { toRecordsWithAuthors } from './incidentRecord.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function listIncidentRecords(
  scope: EventScope,
  query: ListIncidentsQuery,
): Promise<Page<IncidentRecord>> {
  const rows = await listIncidents(scope, {
    ...(query.status ? { status: query.status } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });

  const page = toPage(rows, query.limit);
  return {
    data: await toRecordsWithAuthors(page.data),
    nextCursor: page.nextCursor,
  };
}
