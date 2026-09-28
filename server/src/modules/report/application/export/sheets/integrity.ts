import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, rows, sgt } from '../format.js';

export function writeIntegritySheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.integrity);
  sheet.columns = [{ width: 24 }, { width: 24 }, { width: 24 }, { width: 16 }, { width: 50 }];

  sheet.addRow(['Fallback windows — periods when data was captured off-app']).font = {
    bold: true,
  };
  sheet.addRow(['Tier', 'Started (SGT)', 'Ended (SGT)', 'Minutes', 'Scope and reason']).font = {
    bold: true,
  };

  for (const row of windowRows(report)) sheet.addRow(row);

  sheet.addRow([]);
  sheet.addRow(['Records by source']).font = { bold: true };
  sheet.addRow(['Table', 'Source', 'Records']).font = { bold: true };
  for (const row of rows.recordsBySource(report)) sheet.addRow([...row]);

  sheet.addRow([]);
  sheet.addRow(['Imports run']).font = { bold: true };
  sheet.addRow(['Imported (SGT)', 'Source', 'Target', 'Rows', 'File / notes']).font = {
    bold: true,
  };
  for (const row of importRows(report)) sheet.addRow(row);

  sheet.addRow([]);
  sheet.addRow(['Voided records — corrections, excluded from every count above']).font = {
    bold: true,
  };
  sheet.addRow(['Table', 'Voided']).font = { bold: true };
  for (const row of report.dataIntegrity.voidedRecords) sheet.addRow([row.table, row.value]);
}

function windowRows(report: FullReport): Array<Array<string | number>> {
  const windows = report.dataIntegrity.fallbackWindows;
  if (windows.length === 0) return [['—', '—', '—', 0, 'No fallback windows were declared.']];
  return windows.map((window) => [
    window.tier === 4 ? '4 (paper)' : '3 (Google pack)',
    sgt(window.startedAt),
    window.endedAt ? sgt(window.endedAt) : 'still open',
    window.durationMinutes ?? 0,
    `${window.stationName ?? 'Event-wide'} — ${window.reason}`,
  ]);
}

function importRows(report: FullReport): Array<Array<string | number>> {
  return report.dataIntegrity.imports.map((batch) => [
    sgt(batch.importedAt),
    batch.source,
    batch.targetTable,
    batch.rowCount,
    [batch.fileName, batch.notes].filter(Boolean).join(' — ') || '—',
  ]);
}
