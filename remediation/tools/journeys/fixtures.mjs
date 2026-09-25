/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Things for a journey to act on that no screen can create (P02.4 onwards):
 * a swap request (to a volunteer free that block), an open incident and an active lost-person alert, all raised
 * by the booth volunteer.
 *
 *   node remediation/tools/journeys/fixtures.mjs
 *
 * Local dev server only (D-13). Two dev-auth sign-ins per run.
 */
import { API_URL, BASE_URL } from './lib.mjs';

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

async function main() {
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
