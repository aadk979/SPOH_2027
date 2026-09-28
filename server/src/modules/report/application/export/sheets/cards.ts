import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, header } from '../format.js';

export function writeCardsSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.cards);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  sheet.addRow(['Unit: cards — journeys. One card may be a whole family.']).font = { bold: true };
  sheet.addRow([`Issued: ${report.cards.issued}`]);
  sheet.addRow([`Completed: ${report.cards.completed}`]);
  sheet.addRow([`Voided: ${report.cards.voided}`]);
  sheet.addRow([`Completion rate: ${(report.cards.completionRate * 100).toFixed(1)}%`]);
  sheet.addRow([]);

  header(sheet, ['Station', 'Cards reaching this station']);
  for (const row of report.cards.byStation) sheet.addRow([row.stationName, row.cards]);

  sheet.addRow([]);
  // Split deliberately: visitors keep their card and return, so a card issued
  // on 6 Jan may complete on 8 Jan and the two series will not agree.
  sheet.addRow(['Issued and completed by day — these do NOT have to match']).font = { bold: true };
  sheet.addRow(['Date', 'Issued', 'Completed']).font = { bold: true };

  const completedByDate = new Map(report.cards.completedByDay.map((row) => [row.date, row.value]));
  const dates = new Set([
    ...report.cards.issuedByDay.map((row) => row.date),
    ...report.cards.completedByDay.map((row) => row.date),
  ]);

  for (const date of [...dates].sort()) {
    const issued = report.cards.issuedByDay.find((row) => row.date === date)?.value ?? 0;
    sheet.addRow([date, issued, completedByDate.get(date) ?? 0]);
  }
}
