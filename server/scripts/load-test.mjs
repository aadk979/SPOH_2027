import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';

/**
 * Capture load test (BUILD_PLAN §12, Phase 4 acceptance).
 *
 * 100 concurrent capture clients at 20 taps per minute each, p95 under 300ms.
 *
 * Run against a RUNNING server, never in CI: it provisions accounts and writes
 * real rows, and belongs on staging before the dry runs rather than in a pull
 * request. That is why it is a script and not a test.
 *
 *   node scripts/load-test.mjs --clients 100 --taps 20 --duration 60
 *
 * The shape being simulated is the real one: many DISTINCT volunteers, each on
 * their own device and their own account, tapping steadily, every request
 * carrying its own idempotency key.
 *
 * Simulating them as one shared account would be wrong twice over. Rate
 * limiting is keyed per subject, so a hundred clients on one token would hit a
 * ceiling no real volunteer ever meets; and a single account would serialise
 * behind one row's worth of contention that the event does not have.
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
}

const CLIENTS = arg('clients', 100);
const TAPS_PER_MINUTE = arg('taps', 20);
const DURATION_SECONDS = arg('duration', 60);
const P95_BUDGET_MS = arg('budget', 300);
/** Seconds of ramp-up excluded from the steady-state figures. */
const RAMP_SECONDS = arg('ramp', 5);

const BASE = process.env.LOAD_TEST_API ?? 'http://localhost:4010';
const CHIEF_EMAIL = process.env.LOAD_TEST_CHIEF ?? 'chief@spoh2027.test';
const STATION_CODE = process.env.LOAD_TEST_STATION ?? 'SIGNUP_BOOTH';

/** Provisioned accounts are namespaced so they are easy to spot and remove. */
const LOAD_EMAIL_DOMAIN = 'loadtest.spoh2027.test';

/**
 * Mint a development token directly, rather than through the sign-in route.
 *
 * `/dev-auth/sign-in` is rate limited to 20 requests a minute, and correctly
 * so - it is the endpoint that hands out credentials. Signing a hundred
 * volunteers in through it would either take five minutes or require weakening
 * a control that exists for a good reason, so the harness signs its own tokens
 * exactly as tests/helpers/fixtures.ts does.
 */
function loadLocalSecret() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    // Falling back to the ambient environment.
  }

  const secret = process.env.LOCAL_AUTH_SECRET;
  if (!secret) {
    throw new Error('LOCAL_AUTH_SECRET is not set. This script needs AUTH_PROVIDER=local.');
  }

  return new TextEncoder().encode(secret);
}

const LOCAL_SECRET = loadLocalSecret();

/** Matches the local identity provider, so the subject resolves to the roster row. */
function subjectFor(email) {
  return `local:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

async function signIn(email, role = 'VOLUNTEER') {
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

/**
 * Create the simulated volunteers and put them on shift.
 *
 * Uses the real roster import, which means this also exercises the provisioning
 * path under something close to its worst case.
 */
async function provisionClients(chiefToken) {
  const me = await api(chiefToken, '/me');
  const today = me.serverTime.slice(0, 10);

  const rows = Array.from({ length: CLIENTS }, (_unused, index) => ({
    displayName: `Load Test ${index + 1}`,
    email: `load-${String(index + 1).padStart(3, '0')}@${LOAD_EMAIL_DOMAIN}`,
    role: 'VOLUNTEER',
    stationCode: STATION_CODE,
    eventDate: today,
    // Both blocks, so the run is not sensitive to the hour it starts at.
    block: 'MORNING',
    roleLabel: 'Load test',
  }));

  const morning = await api(chiefToken, '/roster/import', {
    method: 'POST',
    body: JSON.stringify({ rows, commit: true }),
  });

  const afternoon = await api(chiefToken, '/roster/import', {
    method: 'POST',
    body: JSON.stringify({
      rows: rows.map((row) => ({ ...row, block: 'AFTERNOON' })),
      commit: true,
    }),
  });

  if (morning.issues.length > 0 || afternoon.issues.length > 0) {
    console.error('provisioning issues:', [...morning.issues, ...afternoon.issues].slice(0, 5));
    throw new Error('could not provision the load-test roster');
  }

  console.log(
    `provisioned ${morning.volunteersCreated + morning.volunteersUpdated} volunteers at ${STATION_CODE}`,
  );

  return rows.map((row) => row.email);
}

/**
 * One simulated device, tapping at a steady rate for the duration.
 *
 * `stagger` spreads the start times. A hundred volunteers do not open the app
 * on the same millisecond, and a synchronised first tick measures a thundering
 * herd rather than the load the event actually produces.
 */
async function runClient({ token, stationId, samples, errors, deadline, stagger }) {
  const intervalMs = 60_000 / TAPS_PER_MINUTE;

  await new Promise((resolve) => setTimeout(resolve, stagger));

  while (Date.now() < deadline) {
    const startedAt = performance.now();

    try {
      const response = await fetch(`${BASE}/api/v1/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: 'SEC_4',
          stationId,
          // A fresh key per tap, exactly as the outbox does.
          idempotencyKey: crypto.randomUUID(),
          clientRecordedAt: new Date().toISOString(),
        }),
      });

      samples.push({ at: Date.now(), ms: performance.now() - startedAt });
      if (!response.ok) errors.push(response.status);
    } catch (error) {
      errors.push(String(error));
    }

    // Jittered, so clients do not re-synchronise over the course of the run.
    await new Promise((resolve) => setTimeout(resolve, intervalMs * (0.5 + Math.random())));
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function pad(value) {
  return value.toFixed(0).padStart(5);
}

async function main() {
  console.log(
    `load test: ${CLIENTS} distinct volunteers x ${TAPS_PER_MINUTE} taps/min for ${DURATION_SECONDS}s against ${BASE}`,
  );

  const chiefToken = await signIn(CHIEF_EMAIL, 'CHIEF_COORDINATOR');
  const emails = await provisionClients(chiefToken);

  const tokens = await Promise.all(emails.map(signIn));

  const first = await api(tokens[0], '/me');
  if (!first.currentAssignment) {
    throw new Error(
      'the provisioned volunteers are not on shift. Run inside event hours, or seed a sandbox event day.',
    );
  }

  const stationId = first.currentAssignment.station.id;

  const samples = [];
  const errors = [];
  const wallStart = Date.now();
  const deadline = wallStart + DURATION_SECONDS * 1000;
  const startedAt = performance.now();

  await Promise.all(
    tokens.map((token, index) =>
      runClient({
        token,
        stationId,
        samples,
        errors,
        deadline,
        // Ramp in over one tap interval, which is how a shift actually starts.
        stagger: (index / CLIENTS) * (60_000 / TAPS_PER_MINUTE),
      }),
    ),
  );

  const elapsedSeconds = (performance.now() - startedAt) / 1000;

  const all = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  // Steady state excludes the ramp, so a cold pool and a synchronised start do
  // not hide what the server does for the other four days of the event.
  const rampEnds = wallStart + RAMP_SECONDS * 1000;
  const steady = samples
    .filter((sample) => sample.at >= rampEnds)
    .map((sample) => sample.ms)
    .sort((a, b) => a - b);

  console.log('');
  console.log(`requests      ${all.length}`);
  console.log(`throughput    ${(all.length / elapsedSeconds).toFixed(1)}/s`);
  console.log(`errors        ${errors.length}`);
  console.log('');
  console.log('                 all      steady state');
  console.log(`p50           ${pad(percentile(all, 50))}ms   ${pad(percentile(steady, 50))}ms`);
  console.log(
    `p95           ${pad(percentile(all, 95))}ms   ${pad(percentile(steady, 95))}ms   (budget ${P95_BUDGET_MS}ms)`,
  );
  console.log(`p99           ${pad(percentile(all, 99))}ms   ${pad(percentile(steady, 99))}ms`);
  console.log(`max           ${pad(all.at(-1) ?? 0)}ms   ${pad(steady.at(-1) ?? 0)}ms`);

  const p95 = percentile(steady, 95);
  const failed = p95 > P95_BUDGET_MS || errors.length > 0;

  console.log('');
  console.log(failed ? 'FAIL' : 'PASS');

  if (errors.length > 0) {
    const counts = new Map();
    for (const error of errors) counts.set(error, (counts.get(error) ?? 0) + 1);
    console.log(
      'errors:',
      [...counts.entries()].map(([key, value]) => `${key} x${value}`).join(', '),
    );
  }

  console.log('');
  console.log(
    `clean up with: DELETE FROM "Volunteer" WHERE email LIKE '%@${LOAD_EMAIL_DOMAIN}' (and their rows)`,
  );

  process.exitCode = failed ? 1 : 0;
}

// Only run when invoked directly, so the file can be imported by a harness.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
