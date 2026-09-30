import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, header, eventTime } from '../format.js';

export function writeSafetySheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.safety);
  sheet.columns = [
    { width: 18 },
    { width: 12 },
    { width: 14 },
    { width: 24 },
    { width: 24 },
    { width: 70 },
    { width: 12 },
  ];

  header(sheet, [
    'Type',
    'Severity',
    'Status',
    'Station',
    'Occurred (local)',
    'What happened',
    'Follow-ups',
  ]);

  for (const incident of report.safety.incidents) {
    sheet.addRow([
      incident.type,
      incident.severity,
      incident.status,
      incident.stationName ?? '—',
      eventTime(incident.occurredAt, report.timezone),
      incident.description,
      incident.followUpCount,
    ]);
  }

  sheet.addRow([]);
  sheet.addRow(['Lost person']).font = { bold: true };
  sheet.addRow([`Cases: ${report.safety.lostPerson.cases}`]);
  sheet.addRow([`Resolved: ${report.safety.lostPerson.resolved}`]);
  sheet.addRow([
    `Median resolution: ${report.safety.lostPerson.medianResolutionMinutes ?? '—'} minutes`,
  ]);
  // The descriptions are purged 24h after resolution and no report ever reads
  // them. Saying so here stops anybody going looking for them (§7.3).
  sheet.addRow([
    'Descriptions are deleted once a case is resolved. Only timings and outcomes are retained.',
  ]);

  sheet.addRow([]);
  sheet.addRow(['Lost and found']).font = { bold: true };
  sheet.addRow([`Logged: ${report.safety.lostAndFound.logged}`]);
  sheet.addRow([`Claimed: ${report.safety.lostAndFound.claimed}`]);
  sheet.addRow([`Unclaimed: ${report.safety.lostAndFound.unclaimed}`]);
}
