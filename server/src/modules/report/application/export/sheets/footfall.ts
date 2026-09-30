import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, eventTime, header, rows } from '../format.js';

export function writeFootfallSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.footfall);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 26 }, { width: 16 }];

  sheet.addRow(['Unit: room entries — bodies through a doorway, NOT unique visitors']).font = {
    bold: true,
  };
  sheet.addRow([`Total: ${report.footfall.total}`]);
  sheet.addRow([]);

  header(sheet, ['Station', 'Room entries', 'Peak 30-min block (local)', 'Peak entries']);
  for (const row of rows.footfallStations(report)) sheet.addRow([...row]);

  sheet.addRow([]);
  sheet.addRow(['By source — how much did not come from an app tap']).font = { bold: true };
  sheet.addRow(['Source', 'Room entries']).font = { bold: true };
  for (const row of report.footfall.bySource) sheet.addRow([row.source, row.value]);

  sheet.addRow([]);
  sheet.addRow(['30-minute curve']).font = { bold: true };
  sheet.addRow(['Block start (local)', 'Station', 'Room entries']).font = { bold: true };
  const names = new Map(report.footfall.byStation.map((row) => [row.stationId, row.stationName]));
  for (const point of report.footfall.curve) {
    sheet.addRow([
      eventTime(point.bucketStart, report.timezone),
      names.get(point.stationId) ?? point.stationId,
      point.value,
    ]);
  }
}
