import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, header, rows } from '../format.js';

export function writeGiftsSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.gifts);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  sheet.addRow(['Unit: redemptions']).font = { bold: true };
  sheet.addRow([`Total: ${report.gifts.total}`]);
  sheet.addRow([]);

  header(sheet, ['Gift', 'Redeemed', 'Remaining']);
  for (const row of rows.giftTypes(report)) sheet.addRow([...row]);

  sheet.addRow([]);
  sheet.addRow(['By day']).font = { bold: true };
  sheet.addRow(['Date', 'Redemptions']).font = { bold: true };
  for (const row of report.gifts.byDay) sheet.addRow([row.date, row.value]);

  sheet.addRow([]);
  sheet.addRow(['By station']).font = { bold: true };
  sheet.addRow(['Station', 'Redemptions']).font = { bold: true };
  for (const row of report.gifts.byStation) sheet.addRow([row.stationName, row.value]);
}
