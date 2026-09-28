import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, header, rows } from '../format.js';

export function writeRegistrationsSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.registrations);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  sheet.addRow(['Unit: registrations — one row per person who signed up']).font = { bold: true };
  sheet.addRow([`Total: ${report.registrations.total}`]);
  sheet.addRow([`Voided and excluded: ${report.registrations.voided}`]);
  sheet.addRow([]);

  header(sheet, ['Category', 'Registrations']);
  for (const row of rows.categories(report)) sheet.addRow([...row]);

  sheet.addRow([]);
  sheet.addRow(['By day']).font = { bold: true };
  sheet.addRow(['Date', 'Registrations']).font = { bold: true };
  for (const row of report.registrations.byDay) sheet.addRow([row.date, row.value]);

  sheet.addRow([]);
  sheet.addRow(['By hour']).font = { bold: true };
  sheet.addRow(['Hour (Singapore)', 'Registrations']).font = { bold: true };
  for (const row of report.registrations.byHour) sheet.addRow([row.localHour, row.value]);
}
