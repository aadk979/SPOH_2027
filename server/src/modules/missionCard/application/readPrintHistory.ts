import type {
  CardPrintExportDetailResponse,
  CardPrintExportListQuery,
  CardPrintExportListResponse,
} from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findPrintExport } from '../data/printRepo.js';
import { findPrintAnchor, findPrintHistory } from '../data/printHistoryRepo.js';
import { toPrintExportDetail, toPrintExportRecord } from '../data/printHistoryMappers.js';

export async function listPrintHistory(
  scope: EventScope,
  query: CardPrintExportListQuery,
): Promise<CardPrintExportListResponse> {
  const anchor = query.cursor ? await findPrintAnchor(scope, query.cursor) : null;
  if (query.cursor && !anchor) throw new NotFoundError('Print export cursor in this event');
  const { data, nextCursor } = toPage(
    await findPrintHistory(scope, { limit: query.limit, anchor }),
    query.limit,
  );
  return { data: data.map(toPrintExportRecord), meta: { count: data.length, nextCursor } };
}

export async function readPrintExport(
  scope: EventScope,
  id: string,
): Promise<CardPrintExportDetailResponse> {
  const row = await findPrintExport(scope, id);
  if (!row) throw new NotFoundError('Card print export in this event');
  return { data: toPrintExportDetail(row) };
}
