import type ExcelJS from 'exceljs';
import type { FullReport } from '@spoh/shared';
import { localTimestamp } from '../../../../platform/time/index.js';

/**
 * Render an instant on the event's wall clock, for a human, with its UTC
 * offset: "YYYY-MM-DD HH:MM +08:00".
 *
 * The workbook is read by the committee about an event that happened in one
 * place. Labelling the peak period in UTC is technically honest and practically
 * useless — "the busiest block started at 03:30" is not a sentence anybody can
 * act on. The offset stays on every value so the rows either side of a DST
 * change cannot be misread. The true instant is still in the API payload.
 */
export function eventTime(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  return localTimestamp(new Date(iso), timezone);
}

/** Sheet names, so the export and the CSV bundle stay in step. */
export const SHEETS = {
  readMe: 'Read me first',
  registrations: 'Registrations',
  footfall: 'Room entries',
  cards: 'Mission Cards',
  gifts: 'Gifts',
  safety: 'Safety',
  volunteers: 'Volunteers',
  integrity: 'Data integrity',
} as const;

/** A bold header row, frozen, so the columns stay labelled while scrolling. */
export function header(sheet: ExcelJS.Worksheet, columns: string[]): void {
  const row = sheet.addRow(columns);
  row.font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: row.number }];
}

/**
 * Rows the workbook and the CSV both print, built once so the two files cannot
 * disagree about a figure.
 */
export const rows = {
  categories: (report: FullReport) =>
    report.registrations.byCategory.map((row) => [row.label, row.value] as const),
  footfallStations: (report: FullReport) =>
    report.footfall.byStation.map(
      (row) =>
        [
          row.stationName,
          row.total,
          eventTime(row.peakBlockStart, report.timezone),
          row.peakBlockValue,
        ] as const,
    ),
  giftTypes: (report: FullReport) =>
    report.gifts.byGiftType.map((row) => [row.giftTypeName, row.redeemed, row.remaining] as const),
  recordsBySource: (report: FullReport) =>
    report.dataIntegrity.recordsBySource.map((row) => [row.table, row.source, row.value] as const),
};

export type { ExcelJS };
