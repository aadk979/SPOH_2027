import type { ListLostFoundQuery, LostFoundRecord } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { listItemRows } from '../data/repo.js';
import { toRecordWithStation } from './itemRecord.js';

export async function listItems(query: ListLostFoundQuery): Promise<Page<LostFoundRecord>> {
  const rows = await listItemRows(query);
  const page = toPage(rows, query.limit);
  return {
    data: await Promise.all(page.data.map(toRecordWithStation)),
    nextCursor: page.nextCursor,
  };
}
