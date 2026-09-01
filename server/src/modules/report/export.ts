import ExcelJS from 'exceljs';
import type { FullReport } from '@spoh/shared';

/**
 * Report export (PRODUCT_BRIEF §10).
 *
 * One workbook for the Lead (Comms & Outreach), one sheet per section, in the
 * order somebody would actually read them.
 *
 * The first sheet is the counting note. It is not decoration: the single most
 * likely misuse of this workbook is somebody adding the registration total to
 * the room-entry total, and the sheet that opens by default is the cheapest
 * place to say why that number would be meaningless.
 */

/** Sheet names, so the export and the CSV bundle stay in step. */
const SHEETS = {
  readMe: 'Read me first',
  registrations: 'Registrations',
  footfall: 'Room entries',
  cards: 'Mission Cards',
  gifts: 'Gifts',
  safety: 'Safety',
  volunteers: 'Volunteers',
  integrity: 'Data integrity',
} as const;

export async function toXlsx(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SPOH 2027 Operations';
  workbook.created = new Date(report.generatedAt);

  buildReadMe(workbook, report);
  buildRegistrations(workbook, report);
  buildFootfall(workbook, report);
  buildCards(workbook, report);
  buildGifts(workbook, report);
  buildSafety(workbook, report);
  buildVolunteers(workbook, report);
  buildIntegrity(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function header(sheet: ExcelJS.Worksheet, columns: string[]): void {
  const row = sheet.addRow(columns);
  row.font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: row.number }];
}

function buildReadMe(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.readMe);
  sheet.columns = [{ width: 110 }];

  sheet.addRow(['SPOH 2027 — post-event report']).font = { bold: true, size: 14 };
  sheet.addRow([]);
  sheet.addRow([`Generated ${new Date(report.generatedAt).toISOString()}`]);
  sheet.addRow([
    `Range: ${report.range.from ?? 'start of event'} to ${report.range.to ?? 'end of event'}`,
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

function buildRegistrations(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.registrations);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  sheet.addRow(['Unit: registrations — one row per person who signed up']).font = { bold: true };
  sheet.addRow([`Total: ${report.registrations.total}`]);
  sheet.addRow([`Voided and excluded: ${report.registrations.voided}`]);
  sheet.addRow([]);

  header(sheet, ['Category', 'Registrations']);
  for (const row of report.registrations.byCategory) sheet.addRow([row.key, row.value]);

  sheet.addRow([]);
  sheet.addRow(['By day']).font = { bold: true };
  sheet.addRow(['Date', 'Registrations']).font = { bold: true };
  for (const row of report.registrations.byDay) sheet.addRow([row.date, row.value]);

  sheet.addRow([]);
  sheet.addRow(['By hour']).font = { bold: true };
  sheet.addRow(['Hour (UTC)', 'Registrations']).font = { bold: true };
  for (const row of report.registrations.byHour) sheet.addRow([row.hour, row.value]);
}

function buildFootfall(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.footfall);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 26 }, { width: 16 }];

  sheet.addRow(['Unit: room entries — bodies through a doorway, NOT unique visitors']).font = {
    bold: true,
  };
  sheet.addRow([`Total: ${report.footfall.total}`]);
  sheet.addRow([]);

  header(sheet, ['Station', 'Room entries', 'Peak 30-min block', 'Peak entries']);
  for (const row of report.footfall.byStation) {
    sheet.addRow([row.stationName, row.total, row.peakBlockStart ?? '—', row.peakBlockValue]);
  }

  sheet.addRow([]);
  sheet.addRow(['By source — how much did not come from an app tap']).font = { bold: true };
  sheet.addRow(['Source', 'Room entries']).font = { bold: true };
  for (const row of report.footfall.bySource) sheet.addRow([row.source, row.value]);

  sheet.addRow([]);
  sheet.addRow(['30-minute curve']).font = { bold: true };
  sheet.addRow(['Block start (UTC)', 'Station', 'Room entries']).font = { bold: true };
  const names = new Map(report.footfall.byStation.map((row) => [row.stationId, row.stationName]));
  for (const point of report.footfall.curve) {
    sheet.addRow([point.bucketStart, names.get(point.stationId) ?? point.stationId, point.value]);
  }
}

function buildCards(workbook: ExcelJS.Workbook, report: FullReport): void {
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

function buildGifts(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.gifts);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  sheet.addRow(['Unit: redemptions']).font = { bold: true };
  sheet.addRow([`Total: ${report.gifts.total}`]);
  sheet.addRow([]);

  header(sheet, ['Gift', 'Redeemed', 'Remaining']);
  for (const row of report.gifts.byGiftType) {
    sheet.addRow([row.giftTypeName, row.redeemed, row.remaining]);
  }

  sheet.addRow([]);
  sheet.addRow(['By day']).font = { bold: true };
  sheet.addRow(['Date', 'Redemptions']).font = { bold: true };
  for (const row of report.gifts.byDay) sheet.addRow([row.date, row.value]);

  sheet.addRow([]);
  sheet.addRow(['By station']).font = { bold: true };
  sheet.addRow(['Station', 'Redemptions']).font = { bold: true };
  for (const row of report.gifts.byStation) sheet.addRow([row.stationName, row.value]);
}

function buildSafety(workbook: ExcelJS.Workbook, report: FullReport): void {
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
    'Occurred (UTC)',
    'What happened',
    'Follow-ups',
  ]);

  for (const incident of report.safety.incidents) {
    sheet.addRow([
      incident.type,
      incident.severity,
      incident.status,
      incident.stationName ?? '—',
      incident.occurredAt,
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

function buildVolunteers(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.volunteers);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }, { width: 12 }];

  sheet.addRow([`Active volunteers: ${report.volunteers.volunteersActive}`]);
  sheet.addRow([`Shift assignments: ${report.volunteers.assignments}`]);
  sheet.addRow([`Checked in: ${report.volunteers.checkedIn}`]);
  sheet.addRow([
    `No-shows: ${report.volunteers.noShows} (${(report.volunteers.noShowRate * 100).toFixed(1)}%)`,
  ]);
  sheet.addRow([`Total hours: ${report.volunteers.totalHours}`]);
  sheet.addRow([
    'Hours count check-in to check-out. Anyone who never checked out contributes zero rather than an open-ended figure.',
  ]);
  sheet.addRow([]);

  header(sheet, ['Station', 'Assignments', 'Checked in', 'Hours']);
  for (const row of report.volunteers.byStation) {
    sheet.addRow([row.stationName, row.assignments, row.checkedIn, row.hours]);
  }
}

function buildIntegrity(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.integrity);
  sheet.columns = [{ width: 24 }, { width: 24 }, { width: 24 }, { width: 16 }, { width: 50 }];

  sheet.addRow(['Fallback windows — periods when data was captured off-app']).font = {
    bold: true,
  };
  sheet.addRow(['Tier', 'Started (UTC)', 'Ended (UTC)', 'Minutes', 'Scope and reason']).font = {
    bold: true,
  };

  if (report.dataIntegrity.fallbackWindows.length === 0) {
    sheet.addRow(['—', '—', '—', 0, 'No fallback windows were declared.']);
  } else {
    for (const window of report.dataIntegrity.fallbackWindows) {
      sheet.addRow([
        window.tier === 4 ? '4 (paper)' : '3 (Google pack)',
        window.startedAt,
        window.endedAt ?? 'still open',
        window.durationMinutes ?? 0,
        `${window.stationName ?? 'Event-wide'} — ${window.reason}`,
      ]);
    }
  }

  sheet.addRow([]);
  sheet.addRow(['Records by source']).font = { bold: true };
  sheet.addRow(['Table', 'Source', 'Records']).font = { bold: true };
  for (const row of report.dataIntegrity.recordsBySource) {
    sheet.addRow([row.table, row.source, row.value]);
  }

  sheet.addRow([]);
  sheet.addRow(['Imports run']).font = { bold: true };
  sheet.addRow(['Imported (UTC)', 'Source', 'Target', 'Rows', 'File / notes']).font = {
    bold: true,
  };
  for (const batch of report.dataIntegrity.imports) {
    sheet.addRow([
      batch.importedAt,
      batch.source,
      batch.targetTable,
      batch.rowCount,
      [batch.fileName, batch.notes].filter(Boolean).join(' — ') || '—',
    ]);
  }

  sheet.addRow([]);
  sheet.addRow(['Voided records — corrections, excluded from every count above']).font = {
    bold: true,
  };
  sheet.addRow(['Table', 'Voided']).font = { bold: true };
  for (const row of report.dataIntegrity.voidedRecords) sheet.addRow([row.table, row.value]);
}

/**
 * CSV export.
 *
 * A workbook flattened into one file, with a blank line and a `## Section`
 * marker between blocks. Less pretty than the XLSX, but it opens anywhere and
 * survives being emailed — which is the point of offering it at all.
 */
export function toCsv(report: FullReport): string {
  const lines: string[] = [];

  const section = (title: string): void => {
    lines.push('', `## ${title}`);
  };

  const row = (...cells: Array<string | number | null>): void => {
    lines.push(cells.map(escapeCsv).join(','));
  };

  lines.push('# SPOH 2027 post-event report');
  lines.push(`# Generated,${report.generatedAt}`);
  lines.push(`# ${report.countingNote.replace(/,/g, ';')}`);

  section('Registrations (unit: registrations)');
  row('Category', 'Registrations');
  for (const item of report.registrations.byCategory) row(item.key, item.value);
  row('TOTAL', report.registrations.total);

  section('Room entries (unit: roomEntries — not unique visitors)');
  row('Station', 'Room entries', 'Peak block', 'Peak value');
  for (const item of report.footfall.byStation) {
    row(item.stationName, item.total, item.peakBlockStart, item.peakBlockValue);
  }
  row('TOTAL', report.footfall.total);

  section('Mission Cards (unit: cards — journeys, not people)');
  row('Metric', 'Value');
  row('Issued', report.cards.issued);
  row('Completed', report.cards.completed);
  row('Voided', report.cards.voided);
  row('Completion rate', `${(report.cards.completionRate * 100).toFixed(1)}%`);

  section('Gifts (unit: redemptions)');
  row('Gift', 'Redeemed', 'Remaining');
  for (const item of report.gifts.byGiftType) {
    row(item.giftTypeName, item.redeemed, item.remaining);
  }

  section('Safety');
  row('Type', 'Severity', 'Status', 'Station', 'Occurred', 'What happened');
  for (const incident of report.safety.incidents) {
    row(
      incident.type,
      incident.severity,
      incident.status,
      incident.stationName,
      incident.occurredAt,
      incident.description,
    );
  }
  row('Lost-person cases', report.safety.lostPerson.cases);
  row('Median resolution minutes', report.safety.lostPerson.medianResolutionMinutes);

  section('Volunteers');
  row('Metric', 'Value');
  row('Assignments', report.volunteers.assignments);
  row('Checked in', report.volunteers.checkedIn);
  row('No-shows', report.volunteers.noShows);
  row('Total hours', report.volunteers.totalHours);

  section('Data integrity');
  row('Tier', 'Started', 'Ended', 'Minutes', 'Scope and reason');
  for (const window of report.dataIntegrity.fallbackWindows) {
    row(
      window.tier,
      window.startedAt,
      window.endedAt,
      window.durationMinutes,
      `${window.stationName ?? 'Event-wide'} - ${window.reason}`,
    );
  }
  row('Records by source', '', '', '', '');
  for (const item of report.dataIntegrity.recordsBySource) {
    row(item.table, item.source, item.value);
  }

  return lines.join('\n');
}

/** RFC 4180 quoting. Incident descriptions contain commas and newlines. */
function escapeCsv(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
