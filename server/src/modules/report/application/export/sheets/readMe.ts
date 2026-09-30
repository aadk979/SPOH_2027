import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS } from '../format.js';

export function writeReadMeSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.readMe);
  sheet.columns = [{ width: 110 }];

  sheet.addRow([`${report.event.name} — post-event report`]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  sheet.addRow([`Generated ${new Date(report.generatedAt).toISOString()}`]);
  sheet.addRow([
    `Range: ${report.range.from ?? 'start of event'} to ${report.range.to ?? 'end of event'}`,
  ]);
  if (report.event.status === 'REHEARSAL') {
    sheet.addRow(['REHEARSAL: every figure in this report is practice data, not the event.']).font =
      {
        bold: true,
      };
  }
  sheet.addRow([
    `Times marked "local" are on the event's clock (${report.timezone}), each with its UTC offset.`,
  ]);
  sheet.addRow([]);

  sheet.addRow(['How to read the numbers']).font = { bold: true };
  const note = sheet.addRow([report.countingNote]);
  note.alignment = { wrapText: true, vertical: 'top' };
  note.height = 60;

  sheet.addRow([]);

  if (report.dataIntegrity.containsFallbackData) {
    const warning = sheet.addRow([
      `This report covers ${report.dataIntegrity.degradedMinutes} minutes of degraded operation across ` +
        `${report.dataIntegrity.fallbackWindows.length} fallback window(s). Figures for those periods came from ` +
        'the Google fallback pack or from paper, and are approximate. See the "Data integrity" sheet for exactly when.',
    ]);
    warning.font = { bold: true };
    warning.alignment = { wrapText: true, vertical: 'top' };
    warning.height = 45;
  } else {
    sheet.addRow(['No fallback windows were declared. Every figure came from the app.']);
  }
}
