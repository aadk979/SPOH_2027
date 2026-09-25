#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P01.2: assign every raw sweep hit (reports/P01/raw/*.txt) to one F01 item or one false-positive
 * reason. The catalogue below mirrors the table in findings/F01-hardcoding.md.
 *
 *   node remediation/reports/P01/classify.mjs           write raw/CLASSIFIED.tsv, print counts
 *   node remediation/reports/P01/classify.mjs --where   also print each item's locations
 *
 * Exits 1 if any hit is unclassified. Rules are tried in order; the first match wins, so specific
 * rules (a file and its lines) come before general ones (all tests, all comments).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = join(dirname(fileURLToPath(import.meta.url)), 'raw');

/** id → [class, short title]. Classes are the ten in phases/P01-audit-hardcoding.md. */
const CATALOGUE = {
  'F01-001': ['event-data', 'Event name in UI chrome and exports'],
  'F01-002': ['event-data', '`eventName` setting default'],
  'F01-003': ['platform-setting', 'Organisation name in UI chrome'],
  'F01-004': ['platform-setting', 'App name "SPOH Ops"'],
  'F01-005': ['event-content', 'App description and manifest name with event dates'],
  'F01-006': ['event-data', 'Report download file names'],
  'F01-007': ['event-content', 'UI placeholders naming this venue and its stations'],
  'F01-008': ['event-data', 'Import screen sample CSV'],
  'F01-009': ['event-setting', 'Campus network wording ("SP Wi-Fi")'],
  'F01-010': ['event-content', 'Mandatory brief points'],
  'F01-011': ['fixture', 'Sign-in placeholder uses the dev seed domain'],
  'F01-012': ['event-content', 'Volunteer brief content file'],
  'F01-013': ['event-content', 'Map page copy'],
  'F01-014': ['event-data', 'Event days and dry runs in the seed'],
  'F01-015': ['event-data', 'Stations and course codes in the seed'],
  'F01-016': ['fixture', 'Seed people, assignments and cards'],
  'F01-017': ['fixture', 'Seed time helpers that assume UTC+8'],
  'F01-018': ['event-data', 'VisitorCategory values and labels'],
  'F01-019': ['event-data', 'StationKind values and branches'],
  'F01-020': ['event-data', 'ShiftBlock values, hours and labels'],
  'F01-021': ['invariant', 'CommitteeRole literals (pending D-03)'],
  'F01-022': ['invariant', 'Workflow and provenance enum literals'],
  'F01-023': ['event-data', 'Server time zone constant and fixed +8 offset'],
  'F01-024': ['event-data', 'Report SQL time zone and UTC hour truncation'],
  'F01-025': ['event-data', 'Report export +8 h shift and "(SGT)" headers'],
  'F01-026': ['event-data', 'Client time zone constant'],
  'F01-027': ['event-data', 'Shared contract docs fix Asia/Singapore'],
  'F01-028': ['event-data', 'Backup script event-hours window in UTC'],
  'F01-029': ['infra-config', 'Cognito pool, client and hosted-UI identifiers'],
  'F01-030': ['infra-config', 'AWS region default'],
  'F01-031': ['infra-config', 'Backup bucket, account id, IAM policy, host layout'],
  'F01-032': ['infra-config', 'Localhost origin defaults'],
  'F01-033': ['infra-config', 'JWT issuer and audience strings'],
  'F01-034': ['fixture', 'Dev and test database names and ports'],
  'F01-035': ['legit-constant', 'Client storage keys'],
  'F01-036': ['legit-constant', 'QR payload prefix on printed cards'],
  'F01-037': ['event-setting', 'ATTENDANCE_ROOT_EMAIL example'],
  'F01-038': ['platform-setting', 'Push TTL per notification kind'],
  'F01-039': ['event-setting', 'Report curve bucket fixed at 30 minutes'],
  'F01-040': ['legit-constant', 'HTTP status codes'],
  'F01-041': ['legit-constant', 'Protocol, unit, format, bound and layout constants'],
  'F01-042': ['fixture', 'Dev-auth token lifetime'],
  'F01-043': ['fixture', 'Unit, integration and e2e test fixtures'],
  'F01-044': ['fixture', 'Load-test and verification script sample data'],
  'F01-045': ['event-data', 'CourseCode enum'],
  'FP-comment': ['false-positive', 'Narrative comment, doc reference or neutral example text'],
  'FP-meta': ['false-positive', 'Project name in package metadata, file headers, identifiers'],
  'FP-match': ['false-positive', "Pattern hit unrelated text (another enum's member, an offset)"],
};

const COMMENT = /^\s*(\/\/|\/\*|\*|#|<!--)/;
const TRAILING_COMMENT = /\s\/\/\s|\/\*\*/;

/**
 * [id, file regex, options]. Options: lines (exact line numbers), text (regex on the hit text),
 * raw (regex on the raw file name). All given options must match.
 */
const RULES = [
  // Tests and test harness: all fixture, whatever they contain.
  [
    'F01-043',
    /^(server\/tests\/|client\/tests\/|client\/playwright\.config\.ts$|server\/vitest\.config\.ts$)/,
  ],
  ['F01-033', /^server\/scripts\/load-test\.mjs$/, { text: /setIssuer|setAudience/ }],
  [
    'F01-044',
    /^server\/scripts\/(load-test|verify-cognito)\.mjs$/,
    {
      text: /'(VOLUNTEER|CHIEF_COORDINATOR|IC|MORNING|AFTERNOON|SEC_4|SIGNUP_BOOTH)'|spoh2027|CHIEF_EMAIL|LOAD_EMAIL/,
    },
  ],

  // Identity and branding
  [
    'F01-002',
    /^(server\/src\/lib\/settings\.ts|client\/src\/lib\/runtimeSettings\.ts)$/,
    { text: /eventName: 'SPOH 2027'/ },
  ],
  ['F01-001', /^client\/src\/app\/layout\.tsx$/, { lines: [8] }],
  ['F01-005', /^client\/src\/app\/layout\.tsx$/, { lines: [9] }],
  ['F01-004', /^client\/src\/app\/layout\.tsx$/, { lines: [11] }],
  ['F01-005', /^client\/public\/manifest\.json$/, { lines: [2, 4] }],
  ['F01-004', /^client\/public\/manifest\.json$/, { lines: [3] }],
  ['F01-004', /^client\/public\/sw\.js$/, { lines: [91] }],
  ['F01-035', /^client\/public\/sw\.js$/, { lines: [16] }],
  ['F01-022', /^client\/public\/sw\.js$/, { lines: [98, 99] }],
  [
    'F01-004',
    /^server\/src\/modules\/(announcement|incident|lostPerson)\/service\.ts$/,
    { text: /SPOH Ops/ },
  ],
  [
    'F01-001',
    /^client\/src\/(app\/(home|tv|admin\/settings)\/page\.tsx|components\/GlobalNav\.tsx)$/,
    { text: /SPOH 2027/ },
  ],
  ['F01-001', /^client\/src\/app\/sign-in\/page\.tsx$/, { lines: [110] }],
  ['F01-003', /^client\/src\/app\/sign-in\/page\.tsx$/, { lines: [112] }],
  ['F01-011', /^client\/src\/app\/sign-in\/page\.tsx$/, { lines: [86] }],
  ['F01-003', /^client\/src\/components\/SectionNav\.tsx$/, { lines: [56] }],
  ['F01-001', /^client\/src\/components\/SectionNav\.tsx$/, { lines: [57] }],
  ['F01-001', /^server\/src\/modules\/report\/export\.ts$/, { lines: [47, 73, 363] }],
  [
    'F01-006',
    /^(server\/src\/modules\/report\/router\.ts|client\/src\/app\/reports\/page\.tsx)$/,
    { text: /spoh2027-report/ },
  ],
  [
    'F01-007',
    /^client\/src\/app\/(safety\/incident\/new|inbox)\/page\.tsx$/,
    { text: /placeholder=|: 'T19/ },
  ],
  ['F01-008', /^client\/src\/app\/chief\/imports\/page\.tsx$/, { lines: [44, 45, 48, 49] }],
  [
    'F01-009',
    /^(client\/src\/app\/attendance\/page\.tsx|client\/src\/features\/attendance\/VerifierCode\.tsx|server\/src\/modules\/attendance\/service\.ts)$/,
    { text: /\bSP (Wi-Fi|network)/ },
  ],
  ['F01-009', /^server\/\.env\.example$/, { lines: [74] }],
  ['F01-010', /^packages\/shared\/src\/dto\/shift\.ts$/, { lines: [96] }],
  ['F01-012', /^client\/src\/content\/brief\.ts$/],
  ['F01-013', /^client\/src\/app\/map\/page\.tsx$/],

  // Seed
  ['F01-014', /^server\/prisma\/seed\.ts$/, { lines: [46, 50, 52, 53, 58, 59, 63, 205, 206] }],
  [
    'F01-015',
    /^server\/prisma\/seed\.ts$/,
    {
      lines: [
        76, 78, 85, 87, 95, 96, 97, 105, 106, 107, 115, 116, 117, 124, 126, 133, 135, 143, 144,
      ],
    },
  ],
  ['F01-017', /^server\/prisma\/seed\.ts$/, { lines: [42, 217, 218, 389] }],
  ['F01-016', /^server\/prisma\/seed\.ts$/],

  // Taxonomy enums (branches and label maps outside the seed and content)
  ['F01-020', /^client\/src\/lib\/format\.ts$/, { lines: [60, 71] }],
  ['F01-018', /^client\/src\/lib\/format\.ts$/, { lines: [82, 83, 84, 85, 86, 87, 88, 89] }],
  ['F01-018', /^client\/src\/app\/capture\/registration\/(group\/)?page\.tsx$/],
  ['F01-019', /^client\/src\/components\/ShiftOverview\.tsx$/, { text: /station\.kind === / }],
  [
    'F01-020',
    /^(server\/src\/lib\/(settings|time)\.ts|client\/src\/app\/admin\/settings\/page\.tsx)$/,
    { text: /\b(MORNING|AFTERNOON)\b|13:30/ },
  ],
  ['F01-020', /^server\/prisma\/schema\.prisma$/, { lines: [90, 91] }],
  [
    'F01-020',
    /^(server\/src\/config\/env\.ts|server\/\.env\.example)$/,
    { text: /09:30-18:00 Singapore/ },
  ],
  [
    'F01-021',
    /^(packages\/shared\/src\/(capabilities|dto\/roster)\.ts|client\/src\/features\/admin\/useVolunteers\.ts|server\/src\/middleware\/(rbac|auth\/cognitoProvider)\.ts|server\/src\/modules\/identity\/provider\.ts)$/,
    { raw: /CommitteeRole/ },
  ],
  [
    'F01-021',
    /^server\/src\/modules\/(announcement|attendance|gift|incident)\/service\.ts$/,
    { raw: /CommitteeRole/ },
  ],
  ['F01-021', /^server\/scripts\/verify-cognito\.mjs$/, { raw: /CommitteeRole/ }],
  [
    'FP-match',
    /./,
    { raw: /07-enum-(StationKind|VisitorCategory)/, text: /'OTHER'|OTHER: 'Other'/ },
  ],
  ['FP-match', /^ops\/backup\//, { raw: /07-enum-IncidentSeverity/ }],
  ['FP-match', /^server\/src\/modules\/footfall\/repo\.ts$/, { raw: /07-enum-CourseCode/ }],
  [
    'F01-022',
    /./,
    {
      raw: /07-enum-(AnnouncementPriority|AttendanceMethod|CardStatus|DataSource|IncidentSeverity|IncidentStatus|IncidentType|LostFoundStatus|LostPersonStatus|SwapStatus)/,
    },
  ],

  [
    'F01-045',
    /^(server\/prisma\/schema\.prisma|packages\/shared\/src\/enums\.ts)$/,
    { raw: /06-course-codes/ },
  ],

  // Time and time zone
  ['F01-023', /^server\/src\/lib\/time\.ts$/, { lines: [4, 7, 19, 21, 22] }],
  [
    'F01-024',
    /^server\/src\/modules\/report\/repo\.ts$/,
    { lines: [48, 50, 54, 75, 81, 153, 159, 183] },
  ],
  ['F01-039', /^server\/src\/modules\/report\/repo\.ts$/, { lines: [104, 111] }],
  ['F01-039', /^server\/src\/modules\/report\/(export|service)\.ts$/, { lines: [135, 146, 217] }],
  [
    'F01-025',
    /^server\/src\/modules\/report\/export\.ts$/,
    { text: /\(SGT\)|8 \* 60 \* 60_000|shifted\.slice|03:30/ },
  ],
  ['F01-026', /^client\/src\/lib\/format\.ts$/, { lines: [10, 14, 24, 38] }],
  ['F01-027', /^packages\/shared\/src\/dto\/(common|settings)\.ts$/, { text: /Asia\/Singapore/ }],
  ['F01-028', /^ops\/backup\/spoh-backup(-check)?\.sh$/, { text: /Event hours are/ }],

  // Infrastructure and deployment identity
  [
    'F01-029',
    /^(server|client)\/\.env\.example$/,
    {
      text: /COGNITO_(USER_POOL|CLIENT)_ID=ap-|COGNITO_(USER_POOL|CLIENT)_ID=\w|provisioned in ap-|in ap-southeast-1 — these/,
    },
  ],
  ['F01-029', /^server\/src\/config\/env\.ts$/, { lines: [56] }],
  [
    'F01-030',
    /^(server\/src\/config\/env\.ts|server\/\.env\.example|client\/\.env\.example|server\/scripts\/(sync|verify)-cognito(-subs)?\.mjs)$/,
    { text: /ap-southeast-1/ },
  ],
  ['F01-041', /^ops\/backup\/iam-policy\.json$/, { text: /"Version"/ }],
  ['FP-match', /^ops\/backup\/spoh-backup\.sh$/, { text: /CHECKSUM:0:16/ }],
  ['F01-031', /^ops\/backup\//],
  [
    'F01-034',
    /^(server\/\.env\.example|scripts\/dev-db-local\.sh|server\/scripts\/setup-test-db\.mjs)$/,
    { text: /spoh2027|5435/ },
  ],
  ['F01-041', /^server\/src\/config\/env\.ts$/, { text: /startsWith\('http:\/\/'\)/ }],
  [
    'F01-032',
    /^(client\/src\/lib\/env\.ts|client\/next\.config\.ts|client\/\.env\.example|server\/\.env\.example|server\/src\/config\/env\.ts|server\/scripts\/verify-cognito\.mjs)$/,
    { text: /localhost/ },
  ],
  [
    'F01-033',
    /^server\/src\/(modules\/auth\/tokens|middleware\/auth\/localProvider)\.ts$/,
    { text: /ISSUER|AUDIENCE/ },
  ],
  ['F01-035', /^client\/src\/lib\/outbox\.ts$/, { text: /DB_NAME/ }],
  [
    'F01-036',
    /^(server\/src\/lib\/shortCode\.ts|client\/src\/app\/capture\/stamp\/page\.tsx)$/,
    { text: /spoh2027:/ },
  ],
  ['F01-037', /^server\/\.env\.example$/, { text: /ATTENDANCE_ROOT_EMAIL/ }],
  ['F01-044', /^server\/scripts\/load-test\.mjs$/],
  ['FP-meta', /^client\/\.env\.example$/, { text: /^NEXT_PUBLIC_COGNITO_\w+_ID=$/ }],
  ['F01-041', /^server\/src\/lib\/time\.ts$/, { lines: [82] }],

  // Magic numbers in server/src/modules
  ['F01-038', /^server\/src\/modules\/notification\/service\.ts$/, { lines: [73, 74, 75, 76, 77] }],
  ['F01-042', /^server\/src\/modules\/devAuth\/router\.ts$/, { text: /12 \* 60 \* 60/ }],
  [
    'F01-040',
    /^server\/src\/modules\//,
    { raw: /09-magic/, text: /status\(|AppError\((4|5)\d\d|^\s*(4|5)0\d,\s*$|status === 4\d\d/ },
  ],

  // False positives before the catch-all legit constants, so comments do not count as values
  ['FP-meta', /(^|\/)package\.json$/],
  ['FP-meta', /^(server|client)\/\.env\.example$/, { lines: [1] }],
  ['FP-meta', /./, { text: /SPOH_(SKIP_DOTENV|PG_PORT|PG_DIR)/ }],
  ['FP-comment', /./, { text: COMMENT }],
  ['FP-comment', /^server\/src\/modules\//, { raw: /09-magic/, text: TRAILING_COMMENT }],
  ['F01-041', /^server\/src\/modules\//, { raw: /09-magic/ }],
  ['F01-041', /^client\/src\/components\/ui\/Field\.tsx$/, { text: /w3\.org/ }],
  ['FP-comment', /^client\/src\/app\/chief\/fallback\/page\.tsx$/, { text: /since 11:15/ }],
];

function matches([, file, options = {}], hit) {
  if (!file.test(hit.file)) return false;
  if (options.lines && !options.lines.includes(hit.line)) return false;
  if (options.text && !options.text.test(hit.text)) return false;
  if (options.raw && !options.raw.test(hit.raw)) return false;
  return true;
}

function readHits() {
  const files = readdirSync(RAW).filter((name) => /^\d\d-.*\.txt$/.test(name));
  return files.flatMap((raw) =>
    readFileSync(join(RAW, raw), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((row) => {
        const [, file, line, text] = row.match(/^([^:]+):(\d+):(.*)$/);
        return { raw: raw.replace(/\.txt$/, ''), file, line: Number(line), text };
      }),
  );
}

function classify(hits) {
  return hits.map((hit) => ({ ...hit, id: RULES.find((rule) => matches(rule, hit))?.[0] }));
}

function locations(rows) {
  const byFile = new Map();
  for (const { file, line } of rows) byFile.set(file, new Set([...(byFile.get(file) ?? []), line]));
  return [...byFile].map(
    ([file, lines]) => `${file}:${[...lines].sort((a, b) => a - b).join(',')}`,
  );
}

const rows = classify(readHits());
writeFileSync(
  join(RAW, 'CLASSIFIED.tsv'),
  [
    'raw\tlocation\tid',
    ...rows.map((r) => `${r.raw}\t${r.file}:${r.line}\t${r.id ?? 'UNCLASSIFIED'}`),
  ].join('\n') + '\n',
);

const byId = Object.groupBy(rows, (r) => r.id ?? 'UNCLASSIFIED');
const byClass = Object.groupBy(
  rows.filter((r) => r.id),
  (r) => CATALOGUE[r.id][0],
);
console.log(`${rows.length} hits`);
for (const [cls, list] of Object.entries(byClass).sort())
  console.log(`  ${cls.padEnd(17)} ${list.length}`);
for (const id of Object.keys(CATALOGUE)) {
  const list = byId[id] ?? [];
  console.log(`${id.padEnd(11)} ${String(list.length).padStart(4)}  ${CATALOGUE[id][1]}`);
  if (process.argv.includes('--where'))
    for (const loc of locations(list)) console.log(`              ${loc}`);
}
const unclassified = byId.UNCLASSIFIED ?? [];
for (const r of unclassified)
  console.log(`UNCLASSIFIED ${r.raw} ${r.file}:${r.line}: ${r.text.trim().slice(0, 120)}`);
process.exit(unclassified.length ? 1 : 0);
