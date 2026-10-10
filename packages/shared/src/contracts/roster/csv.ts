import { RosterImportRow, type RosterImportIssue } from './index.js';
import { csvRecords, type CsvRecord } from './csvRecords.js';

export const ROSTER_CSV_COLUMNS = [
  'displayName',
  'email',
  'role',
  'phone',
  'portfolio',
  'reportsToEmail',
  'stationCode',
  'eventDate',
  'shift',
  'roleLabel',
] as const;
export const ROSTER_CSV_HEADER = ROSTER_CSV_COLUMNS.join(',');
type Column = (typeof ROSTER_CSV_COLUMNS)[number];

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Readonly<Record<string, Column>> = {
  name: 'displayName',
  fullname: 'displayName',
  emailaddress: 'email',
  mobile: 'phone',
  phonenumber: 'phone',
  team: 'portfolio',
  manageremail: 'reportsToEmail',
  station: 'stationCode',
  date: 'eventDate',
  block: 'shift',
  shiftrole: 'roleLabel',
};
const ROLES: Readonly<Record<string, string>> = {
  vol: 'VOLUNTEER',
  volunteer: 'VOLUNTEER',
  ic: 'IC',
  incharge: 'IC',
  dc: 'DEPUTY_COORDINATOR',
  deputycoordinator: 'DEPUTY_COORDINATOR',
  cc: 'CHIEF_COORDINATOR',
  chiefcoordinator: 'CHIEF_COORDINATOR',
  lead: 'LEAD',
  admin: 'ADMIN',
};

export interface ParsedRosterCsv {
  rows: RosterImportRow[];
  issues: RosterImportIssue[];
  totalRows: number;
}

function columnsOf(record: CsvRecord): Column[] {
  const columns = record.cells.map((cell) => {
    const key = squash(cell);
    return ROSTER_CSV_COLUMNS.find((column) => squash(column) === key) ?? ALIASES[key];
  });
  if (columns.some((column) => !column))
    throw new Error('Remove unrecognised columns from the header.');
  if (new Set(columns).size !== columns.length) throw new Error('Each column must appear once.');
  if (!columns.includes('displayName') || !columns.includes('email')) {
    throw new Error('The header needs displayName and email columns.');
  }
  return columns as Column[];
}

function readRow(record: CsvRecord, columns: Column[]): Record<string, string> {
  const row: Record<string, string> = {};
  columns.forEach((column, index) => {
    const cell = record.cells[index]?.trim();
    if (cell) row[column] = cell;
  });
  if (row.role) row.role = ROLES[squash(row.role)] ?? row.role;
  // Shifts and station codes are configurable event data: preserve their spelling.
  return row;
}

export function parseRosterCsv(text: string): ParsedRosterCsv {
  const records = csvRecords(text);
  const header = records.shift();
  if (!header) throw new Error('Paste a CSV with a header and at least one person.');
  const columns = columnsOf(header);
  if (records.length > 1000) throw new Error('Import at most 1,000 rows at a time.');
  const result: ParsedRosterCsv = { rows: [], issues: [], totalRows: records.length };
  for (const record of records) {
    if (record.cells.length > columns.length) {
      result.issues.push({
        rowNumber: record.line,
        field: 'row',
        message: 'More cells than header columns.',
      });
      continue;
    }
    const parsed = RosterImportRow.safeParse(readRow(record, columns));
    if (parsed.success) result.rows.push(parsed.data);
    else
      for (const issue of parsed.error.issues) {
        result.issues.push({
          rowNumber: record.line,
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
  }
  return result;
}
