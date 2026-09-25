/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P02.2 fallback: the parts of "set up Test Event 2027" the UI cannot do,
 * attempted through the API as an admin, with status and time per step.
 *
 *   node remediation/tools/journeys/api-setup.mjs
 *
 * Writes `reports/P02/setup-via-api.json`. Local dev server only (D-13). It adds
 * rows to the dev database; re-running is safe (existing rows come back as 409).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL, BASE_URL, ROOT } from './lib.mjs';

const results = [];
let token = null;

async function call(label, method, url, body) {
  const started = performance.now();
  const res = await fetch(`${API_URL}/api/v1${url}`, {
    method,
    headers: {
      origin: BASE_URL,
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const ms = Math.round(performance.now() - started);
  const message = json?.error?.message ?? null;
  results.push({ label, method, url, status: res.status, ms, message });
  console.log(
    `${String(res.status).padEnd(4)} ${method.padEnd(6)} ${url}  ${label}${message ? `  — ${message}` : ''}`,
  );
  return json;
}

const STATIONS = [
  { code: 'TE_REGISTRATION', name: 'TE Registration', kind: 'SIGNUP_BOOTH', countsEntry: true },
  { code: 'TE_LOUNGE', name: 'TE Lounge', kind: 'WELCOME_LOUNGE' },
  {
    code: 'TE_LAB_A',
    name: 'TE Lab A',
    kind: 'COURSE_STATION',
    courseCode: 'DAAA',
    issuesStamp: true,
  },
  {
    code: 'TE_LAB_B',
    name: 'TE Lab B',
    kind: 'COURSE_STATION',
    courseCode: 'DCS',
    issuesStamp: true,
  },
  { code: 'TE_EXIT', name: 'TE Exit', kind: 'MISSION_COMPLETE' },
];
const DAYS = ['2027-03-06', '2027-03-07'];

function rosterRows() {
  return Array.from({ length: 20 }, (_, i) => ({
    displayName: `Test Volunteer ${i + 1}`,
    email: `te-vol-${i + 1}@spoh2027.test`,
    stationCode: STATIONS[i % STATIONS.length].code,
    eventDate: DAYS[i % 2],
    block: i % 3 === 2 ? 'AFTERNOON' : 'MORNING',
    roleLabel: 'Volunteer',
  }));
}

async function main() {
  const session = await call('sign in as admin (dev auth)', 'POST', '/dev-auth/sign-in', {
    email: 'admin@spoh2027.test',
  });
  token = session.accessToken;

  results.push({
    label: 'create event "Test Event 2027"',
    status: null,
    message: 'no endpoint: there is no Event entity',
  });
  await call('rename the event (the only "event" field)', 'PATCH', '/admin/settings', {
    eventName: 'Test Event 2027',
  });
  await call('restore the event name', 'PATCH', '/admin/settings', { eventName: 'SPOH 2027' });

  for (const date of DAYS) {
    await call(`event day ${date}`, 'POST', '/admin/event-days', {
      date,
      label: `Test Event ${date}`,
      isPublicDay: true,
    });
  }
  await call('a third shift block (EVENING)', 'PATCH', '/admin/settings', {
    shiftBlocks: {
      MORNING: { start: '09:00', end: '12:00' },
      AFTERNOON: { start: '12:00', end: '15:00' },
      EVENING: { start: '15:00', end: '18:00' },
    },
  });
  for (const station of STATIONS)
    await call(`station ${station.code}`, 'POST', '/admin/stations', station);
  await call('a sixth-kind station (kind outside the enum)', 'POST', '/admin/stations', {
    code: 'TE_CAFE',
    name: 'TE Cafe',
    kind: 'CAFE',
  });
  results.push({
    label: 'six visitor categories',
    status: null,
    message: 'no endpoint: VisitorCategory is a Postgres enum',
  });
  await call('gift "TE Lanyard"', 'POST', '/admin/gift-types', {
    name: 'TE Lanyard',
    initialStock: 300,
  });
  await call('gift "TE Sticker"', 'POST', '/admin/gift-types', {
    name: 'TE Sticker',
    initialStock: 1000,
  });

  const rows = rosterRows();
  const preview = await call('roster import, 20 rows (dry run)', 'POST', '/roster/import', {
    rows,
  });
  console.log('     preview issues:', JSON.stringify(preview?.issues?.slice(0, 3) ?? preview));
  const committed = await call('roster import, 20 rows (commit)', 'POST', '/roster/import', {
    rows,
    commit: true,
  });
  console.log(
    '     committed:',
    JSON.stringify(committed && { ...committed, issues: committed.issues?.length }),
  );
  for (const row of rows.slice(0, 1)) {
    await call(`provision ${row.email} one by one`, 'POST', '/roster/volunteers', {
      displayName: row.displayName,
      email: row.email,
    });
  }
  const stations = await call('list stations after setup', 'GET', '/stations');
  const days = await call('list event days after setup', 'GET', '/admin/event-days');
  results.push({
    label: 'what a volunteer now sees',
    status: null,
    message: `${stations?.data?.length ?? '?'} stations and ${days?.data?.length ?? '?'} event days in one list: both events mixed`,
  });

  const out = path.join(ROOT, 'remediation/reports/P02/setup-via-api.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(
    out,
    `${JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
