import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';

/**
 * Polled-screen load test (P11.5 release 2b, D-22).
 *
 * Coordinators and volunteers open their first screen at the same moment, after
 * the server has been idle long enough for its pool to close spare connections,
 * then poll at the screens' real intervals. That is the shape that failed on
 * staging on 9 October 2026: a first screen's burst against a cold pool, which
 * timed out the policies' interactive transaction.
 *
 * Run against a RUNNING server with AUTH_PROVIDER=local, never in CI and never
 * against production: it provisions accounts through the roster import.
 *
 *   node scripts/poll-load-test.mjs --coordinators 15 --volunteers 45 --poll 60 --idle 45
 *
 * It reports statuses and latency per phase and exits non-zero on any 5xx, network
 * error, or answer that differs from the same caller's first answer. Shadow
 * evaluation errors are only in the server's log: grep it for
 * "authorization shadow error" between the phase marks this prints.
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

const COORDINATORS = arg('coordinators', 15);
const VOLUNTEERS = arg('volunteers', 45);
const POLL_SECONDS = arg('poll', 60);
/** Longer than the pool's 30 s idle timeout, so spare connections close first. */
const IDLE_SECONDS = arg('idle', 45);

const BASE = process.env.LOAD_TEST_API ?? 'http://localhost:4010';
const CHIEF_EMAIL = process.env.LOAD_TEST_CHIEF ?? 'chief@spoh2027.test';
const STATION_CODE = process.env.LOAD_TEST_STATION ?? 'SIGNUP_BOOTH';
const LOAD_EMAIL_DOMAIN = 'pollload.spoh2027.test';

function loadLocalSecret() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Falling back to the ambient environment.
  }
  const secret = process.env.LOCAL_AUTH_SECRET;
  if (!secret)
    throw new Error('LOCAL_AUTH_SECRET is not set. This script needs AUTH_PROVIDER=local.');
  return new TextEncoder().encode(secret);
}

const LOCAL_SECRET = loadLocalSecret();

/** Matches the local identity provider, so the subject resolves to the roster row. */
function subjectFor(email) {
  return `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

function signIn(email, role) {
  return new SignJWT({ groups: [role] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subjectFor(email))
    .setIssuer('spoh2027-local-dev')
    .setAudience('spoh2027-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(LOCAL_SECRET);
}

async function api(token, path, init = {}) {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`,
    );
  }
  return body;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What each screen asks for on its first load, and what it then polls, in seconds. */
function screens(eventId) {
  const e = (path) => `/events/${eventId}${path}`;
  const shared = {
    first: [
      '/events',
      e('/me'),
      e('/admin/settings/client'),
      e('/lost-person/active'),
      e('/registrations/categories'),
      e('/attendance'),
      e('/announcements'),
      e('/me/permissions'),
    ],
  };
  return {
    coordinator: {
      first: [...shared.first, e('/dashboard/live')],
      polls: [
        [e('/dashboard/live'), 3],
        [e('/registrations/categories'), 3],
        ['/events', 3],
        [e('/lost-person/active'), 10],
        [e('/announcements'), 5],
      ],
    },
    volunteer: {
      first: shared.first,
      polls: [
        [e('/registrations/categories'), 3],
        [e('/lost-person/active'), 10],
        [e('/announcements'), 30],
        [e('/attendance'), 30],
      ],
    },
  };
}

async function provision(chiefToken) {
  const me = await api(chiefToken, '/me');
  const today = me.serverTime.slice(0, 10);
  const people = [
    ...Array.from({ length: COORDINATORS }, (_u, i) => ({
      kind: 'coordinator',
      role: 'DEPUTY_COORDINATOR',
      n: i,
    })),
    ...Array.from({ length: VOLUNTEERS }, (_u, i) => ({
      kind: 'volunteer',
      role: 'VOLUNTEER',
      n: i,
    })),
  ].map((p) => ({
    ...p,
    email: `${p.kind}-${String(p.n + 1).padStart(3, '0')}@${LOAD_EMAIL_DOMAIN}`,
  }));
  for (const shift of ['MORNING', 'AFTERNOON']) {
    const result = await api(chiefToken, '/roster/import', {
      method: 'POST',
      body: JSON.stringify({
        commit: true,
        rows: people.map((p) => ({
          displayName: `Poll Load ${p.kind} ${p.n + 1}`,
          email: p.email,
          role: p.role,
          stationCode: STATION_CODE,
          eventDate: today,
          shift,
          roleLabel: 'Poll load test',
        })),
      }),
    });
    if (result.issues.length > 0) {
      console.error('provisioning issues:', result.issues.slice(0, 5));
      throw new Error('could not provision the load-test roster');
    }
  }
  return Promise.all(people.map(async (p) => ({ ...p, token: await signIn(p.email, p.role) })));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

class Phase {
  constructor(name) {
    this.name = name;
    this.samples = [];
    this.failures = [];
  }
}

/** A request; its status must match the caller's first answer for that path (304 counts as 200). */
async function hit(phase, client, path) {
  const startedAt = performance.now();
  let status;
  try {
    const response = await fetch(`${BASE}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    await response.arrayBuffer();
    status = response.status === 304 ? 200 : response.status;
  } catch (error) {
    status = `network: ${error.cause?.code ?? error.message}`;
  }
  const ms = performance.now() - startedAt;
  const route = path.replace(/\/events\/[^/]+/, '/events/:id');
  phase.samples.push({ route, ms, status });
  client.expected ??= new Map();
  if (!client.expected.has(path) && typeof status === 'number' && status < 500)
    client.expected.set(path, status);
  if (typeof status !== 'number' || status >= 500 || client.expected.get(path) !== status) {
    phase.failures.push(`${route} → ${status} (expected ${client.expected.get(path) ?? '?'})`);
  }
}

function mark(label) {
  console.log(`[${new Date().toISOString()}] ${label}`);
}

async function burst(name, clients, plan) {
  const phase = new Phase(name);
  mark(`${name}: start`);
  await Promise.all(clients.flatMap((c) => plan[c.kind].first.map((path) => hit(phase, c, path))));
  mark(`${name}: end`);
  return phase;
}

async function poll(clients, plan) {
  const phase = new Phase('polling');
  const deadline = Date.now() + POLL_SECONDS * 1000;
  mark('polling: start');
  await Promise.all(
    clients.flatMap((c) =>
      plan[c.kind].polls.map(async ([path, seconds]) => {
        await wait(Math.random() * seconds * 1000);
        while (Date.now() < deadline) {
          await hit(phase, c, path);
          await wait(seconds * 1000);
        }
      }),
    ),
  );
  mark('polling: end');
  return phase;
}

function report(phase) {
  const all = phase.samples.map((s) => s.ms).sort((a, b) => a - b);
  const byRoute = new Map();
  for (const s of phase.samples) byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s.ms]);
  console.log(`\n${phase.name}: ${all.length} requests, ${phase.failures.length} failures`);
  console.log(
    `  all     p50 ${percentile(all, 50).toFixed(0)}ms  p95 ${percentile(all, 95).toFixed(0)}ms  max ${(all.at(-1) ?? 0).toFixed(0)}ms`,
  );
  for (const [route, values] of [...byRoute].sort()) {
    const sorted = values.sort((a, b) => a - b);
    console.log(
      `  ${route.padEnd(42)} n ${String(sorted.length).padStart(4)}  p95 ${percentile(sorted, 95).toFixed(0).padStart(5)}ms  max ${(sorted.at(-1) ?? 0).toFixed(0).padStart(5)}ms`,
    );
  }
  const counts = new Map();
  for (const f of phase.failures) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts) console.log(`  FAIL ${f} x${n}`);
  return {
    phase: phase.name,
    requests: all.length,
    failures: phase.failures.length,
    p50Ms: Math.round(percentile(all, 50)),
    p95Ms: Math.round(percentile(all, 95)),
    maxMs: Math.round(all.at(-1) ?? 0),
  };
}

async function main() {
  console.log(
    `poll load test: ${COORDINATORS} coordinators, ${VOLUNTEERS} volunteers, ${POLL_SECONDS}s polling, ${IDLE_SECONDS}s idle, against ${BASE}`,
  );
  const chiefToken = await signIn(CHIEF_EMAIL, 'CHIEF_COORDINATOR');
  const [{ id: eventId }] =
    (await api(chiefToken, '/events')).data ?? (await api(chiefToken, '/events'));
  const clients = await provision(chiefToken);
  const plan = screens(eventId);

  mark(`idle ${IDLE_SECONDS}s, so the pool closes its spare connections`);
  await wait(IDLE_SECONDS * 1000);
  const phases = [await burst('cold burst', clients, plan), await poll(clients, plan)];
  mark(`idle ${IDLE_SECONDS}s again`);
  await wait(IDLE_SECONDS * 1000);
  phases.push(await burst('second cold burst', clients, plan));

  const results = phases.map(report);
  const failed = results.some((r) => r.failures > 0);
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ coordinators: COORDINATORS, volunteers: VOLUNTEERS, results }));
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'} (now grep the server log for "authorization shadow error")`,
  );
  console.log(
    `clean up with: DELETE FROM "Person" WHERE email LIKE '%@${LOAD_EMAIL_DOMAIN}' (and their rows)`,
  );
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
