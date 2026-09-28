import type ExcelJS from 'exceljs';
import type { FullReport } from '@spoh/shared';

/**
 * Render an instant in Singapore time, for a human.
 *
 * This workbook is read by the committee, in Singapore, about an event that
 * happened in Singapore. Labelling the peak period in UTC is technically honest
 * and practically useless — "the busiest block started at 03:30" is not a
 * sentence anybody can act on.
 *
 * The true instant is still in the API payload for anything that needs to
 * compute rather than read.
 */
export function sgt(iso: string | null): string {
  if (!iso) return '—';
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
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
    report.registrations.byCategory.map((row) => [row.key, row.value] as const),
  footfallStations: (report: FullReport) =>
    report.footfall.byStation.map(
      (row) => [row.stationName, row.total, sgt(row.peakBlockStart), row.peakBlockValue] as const,
    ),
  giftTypes: (report: FullReport) =>
    report.gifts.byGiftType.map((row) => [row.giftTypeName, row.redeemed, row.remaining] as const),
  recordsBySource: (report: FullReport) =>
    report.dataIntegrity.recordsBySource.map((row) => [row.table, row.source, row.value] as const),
};

export type { ExcelJS };
