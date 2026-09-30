import type { FullReport } from '@spoh/shared';
import { rows, eventTime } from './format.js';

type Cell = string | number | null;

/** One `## Section` block: its title and its rows, the header first. */
interface CsvSection {
  title: string;
  rows: ReadonlyArray<readonly Cell[]>;
}

/**
 * CSV export.
 *
 * A workbook flattened into one file, with a blank line and a `## Section`
 * marker between blocks. Less pretty than the XLSX, but it opens anywhere and
 * survives being emailed — which is the point of offering it at all.
 */
export function toCsv(report: FullReport): string {
  const lines = [
    `# ${report.event.name} post-event report`,
    `# Generated,${report.generatedAt}`,
    `# ${report.countingNote.replace(/,/g, ';')}`,
  ];
  for (const section of sections(report)) {
    lines.push('', `## ${section.title}`);
    for (const cells of section.rows) lines.push(cells.map(escapeCsv).join(','));
  }
  return lines.join('\n');
}

function sections(report: FullReport): CsvSection[] {
  return [
    {
      title: 'Registrations (unit: registrations)',
      rows: [
        ['Category', 'Registrations'],
        ...rows.categories(report),
        ['TOTAL', report.registrations.total],
      ],
    },
    {
      title: 'Room entries (unit: roomEntries — not unique visitors)',
      rows: [
        ['Station', 'Room entries', 'Peak block (local)', 'Peak value'],
        ...rows.footfallStations(report),
        ['TOTAL', report.footfall.total],
      ],
    },
    { title: 'Mission Cards (unit: cards — journeys, not people)', rows: cardRows(report) },
    {
      title: 'Gifts (unit: redemptions)',
      rows: [['Gift', 'Redeemed', 'Remaining'], ...rows.giftTypes(report)],
    },
    { title: 'Safety', rows: safetyRows(report) },
    { title: 'Volunteers', rows: volunteerRows(report) },
    { title: 'Data integrity', rows: integrityRows(report) },
  ];
}

function cardRows(report: FullReport): Cell[][] {
  return [
    ['Metric', 'Value'],
    ['Issued', report.cards.issued],
    ['Completed', report.cards.completed],
    ['Voided', report.cards.voided],
    ['Completion rate', `${(report.cards.completionRate * 100).toFixed(1)}%`],
  ];
}

function safetyRows(report: FullReport): Cell[][] {
  return [
    ['Type', 'Severity', 'Status', 'Station', 'Occurred (local)', 'What happened'],
    ...report.safety.incidents.map((incident) => [
      incident.type,
      incident.severity,
      incident.status,
      incident.stationName,
      eventTime(incident.occurredAt, report.timezone),
      incident.description,
    ]),
    ['Lost-person cases', report.safety.lostPerson.cases],
    ['Median resolution minutes', report.safety.lostPerson.medianResolutionMinutes],
  ];
}

function volunteerRows(report: FullReport): Cell[][] {
  return [
    ['Metric', 'Value'],
    ['Assignments', report.volunteers.assignments],
    ['Checked in', report.volunteers.checkedIn],
    ['No-shows', report.volunteers.noShows],
    ['Not yet due', report.volunteers.notYetDue],
    ['Total hours', report.volunteers.totalHours],
  ];
}

function integrityRows(report: FullReport): Array<readonly Cell[]> {
  return [
    ['Tier', 'Started (local)', 'Ended (local)', 'Minutes', 'Scope and reason'],
    ...report.dataIntegrity.fallbackWindows.map((window) => [
      window.tier,
      eventTime(window.startedAt, report.timezone),
      window.endedAt ? eventTime(window.endedAt, report.timezone) : 'still open',
      window.durationMinutes,
      `${window.stationName ?? 'Event-wide'} - ${window.reason}`,
    ]),
    ['Records by source', '', '', '', ''],
    ...rows.recordsBySource(report),
  ];
}

/** RFC 4180 quoting. Incident descriptions contain commas and newlines. */
function escapeCsv(value: Cell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
