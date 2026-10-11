import { CardPrintExportDetail, CardPrintExportRecord } from '@spoh/shared';
import type { CardPrintExport } from '../../../generated/prisma/client.js';

type Summary = Pick<CardPrintExport, 'id' | 'format' | 'count' | 'rehearsal' | 'createdAt'>;

export function toPrintExportRecord(row: Summary): CardPrintExportRecord {
  return CardPrintExportRecord.parse({
    id: row.id,
    format: row.format,
    count: row.count,
    rehearsal: row.rehearsal,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toPrintExportDetail(row: CardPrintExport): CardPrintExportDetail {
  const context = row.printContext;
  const unknown =
    context === null ||
    (typeof context === 'object' && !Array.isArray(context) && Object.keys(context).length === 0);
  return CardPrintExportDetail.parse({
    ...toPrintExportRecord(row),
    shortCodes: row.shortCodes,
    printContext: unknown ? null : context,
  });
}
