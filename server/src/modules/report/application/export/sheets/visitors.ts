import type { VisitorRecordsResponse } from '@spoh/shared';
import type { ExcelJS } from '../format.js';

/**
 * Visitor details, for a caller whose role reads them, on a sheet of their
 * own so the counts never sit beside them (ADR-002 §4).
 */
export function writeVisitorsSheet(
  workbook: ExcelJS.Workbook,
  visitors: VisitorRecordsResponse,
): void {
  const sheet = workbook.addWorksheet('Visitor details');
  sheet.addRow(['Personal data: keep only as long as the event allows.']).font = { bold: true };
  sheet.addRow(['Registered at (UTC)', ...visitors.fields.map((field) => field.label)]).font = {
    bold: true,
  };
  for (const row of visitors.data) {
    sheet.addRow([row.recordedAt, ...visitors.fields.map((field) => row.values[field.code] ?? '')]);
  }
}
