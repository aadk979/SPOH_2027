import type { ListLostFoundQuery, LostFoundRecord } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { listItemRows } from '../data/repo.js';
import { toRecordsWithStations } from './itemRecord.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function listItems(
  scope: EventScope,
  query: ListLostFoundQuery,
): Promise<Page<LostFoundRecord>> {
  const rows = await listItemRows(scope, query);
  const page = toPage(rows, query.limit);
  return {
    data: await toRecordsWithStations(scope, page.data),
    nextCursor: page.nextCursor,
  };
}
