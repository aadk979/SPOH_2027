/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Things for a journey to act on that no screen can create, in named sets.
 *
 *   node remediation/tools/journeys/fixtures.mjs <ic|volunteer|reset>
 *
 * Local dev server only (D-13). Each set signs in through dev auth once or twice.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_URL, BASE_URL, STATE_DIR } from './lib.mjs';

async function call(token, method, url, body) {
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
  console.log(`${res.status} ${method} ${url}${json?.error ? `  — ${json.error.message}` : ''}`);
  return json;
}

async function signIn(email) {
  return (await call(null, 'POST', '/dev-auth/sign-in', { email })).accessToken;
}

const SETS = {
  /** P02.4: a swap request, an incident and a lost-person alert for the IC. */
  async ic() {
    const admin = await signIn('admin@spoh2027.test');
    const target = (await call(admin, 'GET', '/admin/volunteers?q=te-vol-1%40')).data[0];
    const booth = await signIn('booth@spoh2027.test');
    const [assignment] = (await call(booth, 'GET', '/roster/me')).data;

    await call(booth, 'POST', '/roster/swaps', {
      assignmentId: assignment.id,
      targetVolunteerId: target.id,
      reason: 'Exam the next morning, need to leave early',
    });
    await call(booth, 'POST', '/incidents', {
      idempotencyKey: crypto.randomUUID(),
      type: 'INJURY',
      severity: 'MEDIUM',
      stationId: assignment.station.id,
      description: 'Visitor tripped on the cable ramp by the booth; grazed knee, first aid given.',
      occurredAt: new Date().toISOString(),
    });
    await call(booth, 'POST', '/lost-person', {
      idempotencyKey: crypto.randomUUID(),
      approxAge: 'about 8',
      descriptionText: 'Boy, short black hair, separated from parent at the booth',
      clothingText: 'Red T-shirt, blue shorts',
      lastSeenStationId: assignment.station.id,
    });
  },

  /**
   * P02.5: the attendance chain up to the IC (root admin → IC by PIN), the IC's
   * current PIN in `.state/pin.json` for the volunteer to type, a first-time
   * volunteer on Mission Complete today, and shift hours moved (F01-046).
   * Needs ATTENDANCE_ROOT_EMAIL=admin@spoh2027.test in the local server/.env.
   */
  async volunteer() {
    const admin = await signIn('admin@spoh2027.test');
    await call(admin, 'POST', '/attendance/start');
    const rootCode = await call(admin, 'POST', '/attendance/challenge');
    const ic = await signIn('ic@spoh2027.test');
    await call(ic, 'POST', '/attendance/submit', { method: 'PIN', pin: rootCode.pin });
    const icCode = await call(ic, 'POST', '/attendance/challenge');
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(path.join(STATE_DIR, 'pin.json'), JSON.stringify({ pin: icCode.pin }));

    const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
    const day = (await call(admin, 'GET', '/admin/event-days')).data.find((d) => d.date === today);
    const station = (await call(admin, 'GET', '/admin/stations')).data.find(
      (s) => s.code === 'MISSION_COMPLETE',
    );
    const volunteer = (await call(admin, 'GET', '/admin/volunteers?q=te-vol-2%40')).data[0];
    for (const block of ['MORNING', 'AFTERNOON']) {
      await call(admin, 'POST', '/admin/assignments', {
        volunteerId: volunteer.id,
        stationId: station.id,
        eventDayId: day.id,
        block,
        roleLabel: 'Gift desk',
      });
    }
    await call(admin, 'PATCH', '/admin/settings', {
      shiftBlocks: {
        MORNING: { start: '08:00', end: '12:30' },
        AFTERNOON: { start: '12:00', end: '17:00' },
      },
    });
  },

  /** Shift hours back to the shipped defaults; active lost-person alerts resolved. */
  async reset() {
    const ic = await signIn('ic@spoh2027.test');
    for (const alert of (await call(ic, 'GET', '/lost-person/active')).alerts) {
      await call(ic, 'POST', `/lost-person/${alert.id}/resolve`, { outcome: 'RESOLVED_FOUND' });
    }
    const admin = await signIn('admin@spoh2027.test');
    await call(admin, 'PATCH', '/admin/settings', {
      shiftBlocks: {
        MORNING: { start: '09:30', end: '14:00' },
        AFTERNOON: { start: '13:30', end: '18:00' },
      },
    });
  },
};

async function main() {
  const name = process.argv[2];
  if (!SETS[name]) throw new Error(`Usage: fixtures.mjs <${Object.keys(SETS).join('|')}>`);
  await SETS[name]();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
