import type { CommitteeRole, ShiftBlock } from './enums.js';
import { RosterImportRow } from './dto/roster.js';

/**
 * The roster CSV, in both directions.
 *
 * The file a Chief hands over is never the file the schema describes. It was
 * exported from Sheets with a "Full Name" column, pasted from Excel as
 * tab-separated text, has a byte-order mark, dates typed the Singapore way
 * (7/1/2027) and a role column that says "DC". None of that is an error worth
 * bouncing a 200-row file for, so this module reads what people actually
 * produce and the server only ever sees `RosterImportRow`.
 *
 * It lives in `shared` so that the roster export the server writes and the
 * import the client reads are the same format by construction: export, edit
 * in a spreadsheet, import — and the column names cannot drift.
 */

export const ROSTER_CSV_COLUMNS = [
  'displayName',
  'email',
  'role',
  'phone',
  'portfolio',
  'reportsToEmail',
  'stationCode',
  'eventDate',
  'block',
  'roleLabel',
] as const;
export type RosterCsvColumn = (typeof ROSTER_CSV_COLUMNS)[number];

/** The header line a spreadsheet should start from, and what the export writes. */
export const ROSTER_CSV_HEADER = ROSTER_CSV_COLUMNS.join(',');

/** A file-shaped example. One row per shift, so a person with two shifts is two rows. */
export const ROSTER_CSV_TEMPLATE =
  `${ROSTER_CSV_HEADER}\n` +
  'Tan Mei Ling,meiling@example.edu.sg,IC,+65 9123 4567,Operations,,SIGNUP_BOOTH,2027-01-07,AM,Station IC\n' +
  'Ravi Kumar,ravi@example.edu.sg,Volunteer,,,meiling@example.edu.sg,SIGNUP_BOOTH,2027-01-07,AM,Counter\n' +
  'Ravi Kumar,ravi@example.edu.sg,Volunteer,,,meiling@example.edu.sg,SIGNUP_BOOTH,2027-01-08,PM,Counter\n';

/** Largest file the API accepts in one request. Mirrors `RosterImportRequest`. */
export const ROSTER_IMPORT_MAX_ROWS = 1000;

// ─────────────────────────────────────────────────────────────
// HEADER AND VALUE ALIASES
// ─────────────────────────────────────────────────────────────

/** Lower-case, letters and digits only: "Display Name", "display_name" and "displayName" agree. */
function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Readonly<Record<string, RosterCsvColumn>> = Object.freeze({
  displayname: 'displayName',
  name: 'displayName',
  fullname: 'displayName',
  volunteer: 'displayName',
  volunteername: 'displayName',
  email: 'email',
  emailaddress: 'email',
  role: 'role',
  committeerole: 'role',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  mobilenumber: 'phone',
  contact: 'phone',
  contactnumber: 'phone',
  hp: 'phone',
  portfolio: 'portfolio',
  team: 'portfolio',
  department: 'portfolio',
  reportstoemail: 'reportsToEmail',
  reportsto: 'reportsToEmail',
  manager: 'reportsToEmail',
  manageremail: 'reportsToEmail',
  supervisor: 'reportsToEmail',
  stationcode: 'stationCode',
  station: 'stationCode',
  room: 'stationCode',
  eventdate: 'eventDate',
  date: 'eventDate',
  day: 'eventDate',
  block: 'block',
  shift: 'block',
  shiftblock: 'block',
  session: 'block',
  rolelabel: 'roleLabel',
  shiftrole: 'roleLabel',
  position: 'roleLabel',
  duty: 'roleLabel',
});

const ROLE_ALIASES: Readonly<Record<string, CommitteeRole>> = Object.freeze({
  volunteer: 'VOLUNTEER',
  vol: 'VOLUNTEER',
  ic: 'IC',
  incharge: 'IC',
  stationic: 'IC',
  dc: 'DEPUTY_COORDINATOR',
  deputy: 'DEPUTY_COORDINATOR',
  deputycoordinator: 'DEPUTY_COORDINATOR',
  deputycoord: 'DEPUTY_COORDINATOR',
  cc: 'CHIEF_COORDINATOR',
  chief: 'CHIEF_COORDINATOR',
  chiefcoordinator: 'CHIEF_COORDINATOR',
  chiefcoord: 'CHIEF_COORDINATOR',
  lead: 'LEAD',
  admin: 'ADMIN',
  administrator: 'ADMIN',
});

const BLOCK_ALIASES: Readonly<Record<string, ShiftBlock>> = Object.freeze({
  am: 'MORNING',
  morning: 'MORNING',
  morn: 'MORNING',
  pm: 'AFTERNOON',
  afternoon: 'AFTERNOON',
  aft: 'AFTERNOON',
});

/** Human names for the roles, used in the error a mistyped role gets. */
const ROLE_WORDS = 'Volunteer, IC, Deputy Coordinator, Chief Coordinator, Lead or Admin';

/**
 * Accept the ways a date gets typed in Singapore and hand back ISO.
 *
 * `7/1/2027` is 7 January here, not 1 July — the file was made by the
 * committee, for an event in Singapore, so day-first is the only reading that
 * is not a surprise. Anything unrecognised is returned untouched so the schema
 * rejects it with the format spelled out.
 */
export function normaliseEventDate(value: string): string {
  const trimmed = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  const yearFirst = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(trimmed);
  if (yearFirst) {
    const [, year, month, day] = yearFirst;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  return trimmed;
}

// ─────────────────────────────────────────────────────────────
// TOKENISER
// ─────────────────────────────────────────────────────────────

/**
 * Pick the delimiter from the header line. A paste out of Excel or Sheets is
 * tab-separated; a European locale exports semicolons; a file saved as CSV is
 * commas. Whichever appears most in the first line wins.
 */
function detectDelimiter(headerLine: string): string {
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = headerLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

interface Record_ {
  /** 1-based line in the file where this record begins. The header is line 1. */
  line: number;
  cells: string[];
}

/**
 * RFC 4180, roughly: quoted fields may contain the delimiter, doubled quotes
 * and line breaks. A name like `"Tan, Mei Ling"` is the case that matters —
 * every other parser shortcut splits it into two people.
 */
function tokenise(text: string, delimiter: string): Record_[] {
  const records: Record_[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const push = (): void => {
    cells.push(cell);
    cell = '';
  };

  const endRecord = (): void => {
    push();
    records.push({ line: recordLine, cells });
    cells = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      push();
    } else if (char === '\r') {
      // Handled by the \n that follows, or ignored at end of file.
    } else if (char === '\n') {
      line += 1;
      endRecord();
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || cells.length > 0) endRecord();

  return records;
}

// ─────────────────────────────────────────────────────────────
// PARSE
// ─────────────────────────────────────────────────────────────

export interface RosterCsvError {
  /** The line in the file, as a spreadsheet would number it (header = 1). */
  line: number;
  field: string;
  message: string;
}

export interface RosterCsvRow {
  line: number;
  row: RosterImportRow;
}

export interface ParsedRosterCsv {
  /** Rows that passed the schema, in file order. */
  rows: RosterCsvRow[];
  /** Rows that did not, with what was wrong. Never overlaps `rows`. */
  errors: RosterCsvError[];
  /** Headers that matched nothing. Not an error: a spreadsheet often has a notes column. */
  unknownColumns: string[];
  /** Required columns the header was missing. Non-empty means nothing was parsed. */
  missingColumns: RosterCsvColumn[];
  /** Every non-blank data record, valid or not. */
  totalRows: number;
}

/**
 * Friendlier words than the schema's for the mistakes a spreadsheet makes.
 * The schema's own message is the fallback, never nothing.
 */
function describe(field: string, raw: string | undefined, schemaMessage: string): string {
  switch (field) {
    case 'displayName':
      return 'Name is required';
    case 'email':
      return raw ? `"${raw}" is not an email address` : 'Email is required';
    case 'phone':
      return 'Phone should be at least 6 characters, or left blank';
    case 'role':
      return `Unknown role "${raw ?? ''}" — use ${ROLE_WORDS}`;
    case 'block':
      return `Unknown shift "${raw ?? ''}" — use AM or PM`;
    case 'eventDate':
      return `"${raw ?? ''}" is not a date — use YYYY-MM-DD, e.g. 2027-01-07`;
    case 'reportsToEmail':
      return `"${raw ?? ''}" is not an email address`;
    default:
      return schemaMessage;
  }
}

export function parseRosterCsv(input: string): ParsedRosterCsv {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const firstLineEnd = text.search(/\r?\n/);
  const headerLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);

  const records = tokenise(text, delimiter).filter((record) =>
    record.cells.some((cell) => cell.trim().length > 0),
  );

  const empty: ParsedRosterCsv = {
    rows: [],
    errors: [],
    unknownColumns: [],
    missingColumns: ['displayName', 'email'],
    totalRows: 0,
  };
  const header = records[0];
  if (!header) return empty;

  const columns: Array<RosterCsvColumn | null> = [];
  const unknownColumns: string[] = [];
  for (const cell of header.cells) {
    const key = squash(cell);
    const column = key ? (HEADER_ALIASES[key] ?? null) : null;
    columns.push(column);
    if (!column && cell.trim()) unknownColumns.push(cell.trim());
  }

  const missingColumns = (['displayName', 'email'] as const).filter(
    (required) => !columns.includes(required),
  );
  if (missingColumns.length > 0) {
    return { ...empty, unknownColumns, missingColumns };
  }

  const rows: RosterCsvRow[] = [];
  const errors: RosterCsvError[] = [];

  for (const record of records.slice(1)) {
    const raw: Partial<Record<RosterCsvColumn, string>> = {};
    columns.forEach((column, index) => {
      const value = record.cells[index]?.trim();
      if (column && value) raw[column] = value;
    });

    // A subtotal or a note pasted along with the data has neither a name nor
    // an email. One error that says so, rather than two that do not.
    if (!raw.displayName && !raw.email) {
      errors.push({
        line: record.line,
        field: 'row',
        message: 'This line has no name and no email — is it a note or a subtotal?',
      });
      continue;
    }

    const candidate: Record<string, unknown> = { ...raw };

    if (raw.role !== undefined) {
      candidate.role = ROLE_ALIASES[squash(raw.role)] ?? raw.role.toUpperCase();
    }
    if (raw.block !== undefined) {
      candidate.block = BLOCK_ALIASES[squash(raw.block)] ?? raw.block.toUpperCase();
    }
    if (raw.eventDate !== undefined) {
      candidate.eventDate = normaliseEventDate(raw.eventDate);
    }
    if (raw.stationCode !== undefined) {
      candidate.stationCode = raw.stationCode.toUpperCase();
    }

    const parsed = RosterImportRow.safeParse(candidate);
    if (parsed.success) {
      rows.push({ line: record.line, row: parsed.data });
      continue;
    }

    const seen = new Set<string>();
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? 'row');
      if (seen.has(field)) continue;
      seen.add(field);
      errors.push({
        line: record.line,
        field,
        message: describe(field, raw[field as RosterCsvColumn], issue.message),
      });
    }
  }

  return { rows, errors, unknownColumns, missingColumns: [], totalRows: records.length - 1 };
}

// ─────────────────────────────────────────────────────────────
// SERIALISE
// ─────────────────────────────────────────────────────────────

function escapeCell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  // A leading formula character is how a CSV becomes an exploit when opened
  // in Excel. Committee data should never contain one, so neutralise it.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Write rows in the import's own format, so a round trip is exact. */
export function serialiseRosterCsv(
  rows: ReadonlyArray<Partial<Record<RosterCsvColumn, string | null | undefined>>>,
): string {
  const lines = rows.map((row) =>
    ROSTER_CSV_COLUMNS.map((column) => escapeCell(row[column])).join(','),
  );
  return [ROSTER_CSV_HEADER, ...lines].join('\r\n') + '\r\n';
}
