import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import { createVolunteer } from '../helpers/fixtures.js';

/**
 * Sessions, refresh and rotation.
 *
 * The property under test throughout is that the long-lived credential is never
 * reachable from page script and never usable twice. Everything else here —
 * sign-out, revocation, the device list — exists to serve that.
 */
const app = createApp();

/** Supertest gives cookies back as raw Set-Cookie strings. */
function cookieValue(response: request.Response, name: string): string | null {
  const raw = response.headers['set-cookie'];
  const jar = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const entry of jar) {
    const [pair] = entry.split(';');
    const [key, ...rest] = (pair ?? '').split('=');
    if (key === name) return rest.join('=');
  }

  return null;
}

function cookieAttributes(response: request.Response, name: string): string {
  const raw = response.headers['set-cookie'];
  const jar = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return jar.find((entry) => entry.startsWith(`${name}=`)) ?? '';
}

const COOKIE = 'spoh_refresh';

async function openSession(email: string): Promise<request.Response> {
  return request(app).post('/api/v1/auth/session').send({ email });
}

describe('opening a session', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createVolunteer({ email: 'ic@spoh.test', role: 'IC', displayName: 'Sam IC' });
  });

  it('exchanges a roster email for an access token and a refresh cookie', async () => {
    const response = await openSession('ic@spoh.test');

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.volunteer.displayName).toBe('Sam IC');
    expect(response.body.capabilities).toContain('record.void');
    expect(cookieValue(response, COOKIE)).toEqual(expect.any(String));
  });

  it('makes the refresh cookie unreadable by page script and scopes it to the auth path', async () => {
    const response = await openSession('ic@spoh.test');
    const attributes = cookieAttributes(response, COOKIE);

    // The whole design rests on this: the access token is in memory where XSS
    // could read it, and the durable credential is somewhere script cannot.
    expect(attributes).toMatch(/HttpOnly/i);
    expect(attributes).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it('never returns the refresh token in the body', async () => {
    const response = await openSession('ic@spoh.test');
    expect(JSON.stringify(response.body)).not.toContain(cookieValue(response, COOKIE) ?? 'x');
  });

  it('stores only a hash of the refresh token', async () => {
    const response = await openSession('ic@spoh.test');
    const token = cookieValue(response, COOKIE) as string;

    const rows = await prisma.refreshSession.findMany({ select: { tokenHash: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses an email that is not on the roster', async () => {
    const response = await openSession('stranger@spoh.test');
    expect(response.status).toBe(404);
  });

  it('refuses a deactivated account', async () => {
    await prisma.volunteer.updateMany({
      where: { email: 'ic@spoh.test' },
      data: { active: false },
    });

    const response = await openSession('ic@spoh.test');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('rejects a request from an origin the API does not serve', async () => {
    const response = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', 'https://not-us.example')
      .send({ email: 'ic@spoh.test' });

    expect(response.status).toBe(403);
  });
});

describe('using a session', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createVolunteer({ email: 'ic@spoh.test', role: 'IC' });
  });

  it('authenticates an API call with the issued access token', async () => {
    const session = await openSession('ic@spoh.test');

    const me = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${session.body.accessToken as string}`);

    expect(me.status).toBe(200);
    expect(me.body.volunteer.role).toBe('IC');
  });

  it('stops accepting the access token once that device signs out', async () => {
    const session = await openSession('ic@spoh.test');
    const token = session.body.accessToken as string;

    await request(app)
      .delete('/api/v1/auth/session')
      .set('Cookie', `${COOKIE}=${cookieValue(session, COOKIE) as string}`)
      .expect(204);

    // The token has not expired — it is revoked. Without the session check in
    // requireAuth, a signed-out phone would keep working for its full TTL.
    const after = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

describe('rotation', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createVolunteer({ email: 'ic@spoh.test', role: 'IC' });
  });

  it('issues a new access token and a new cookie', async () => {
    const session = await openSession('ic@spoh.test');
    const first = cookieValue(session, COOKIE) as string;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${COOKIE}=${first}`);

    expect(refreshed.status).toBe(200);

    const second = cookieValue(refreshed, COOKIE) as string;
    expect(second).not.toBe(first);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
  });

  it('revokes the presented token so it is single use', async () => {
    const session = await openSession('ic@spoh.test');
    const first = cookieValue(session, COOKIE) as string;

    await request(app).post('/api/v1/auth/refresh').set('Cookie', `${COOKIE}=${first}`).expect(200);

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${COOKIE}=${first}`);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REUSE_DETECTED');
  });

  /**
   * The reason reuse detection revokes the family rather than the token: when
   * a rotated token reappears there is no way to tell which of the two holders
   * is the attacker, so both are cut off and the volunteer signs in again.
   */
  it('revokes the whole family when a rotated token reappears', async () => {
    const session = await openSession('ic@spoh.test');
    const first = cookieValue(session, COOKIE) as string;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${COOKIE}=${first}`);
    const second = cookieValue(refreshed, COOKIE) as string;

    await request(app).post('/api/v1/auth/refresh').set('Cookie', `${COOKIE}=${first}`).expect(401);

    // The token the honest client is holding is now dead too.
    const afterBreach = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${COOKIE}=${second}`);

    expect(afterBreach.status).toBe(401);

    const live = await prisma.refreshSession.count({ where: { revokedAt: null } });
    expect(live).toBe(0);
  });

  it('clears the cookie when the session is gone, so the client stops retrying', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${COOKIE}=not-a-real-token`);

    expect(response.status).toBe(401);
    expect(cookieAttributes(response, COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });

  it('refuses to refresh without a cookie at all', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });
});

describe('device list', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createVolunteer({ email: 'ic@spoh.test', role: 'IC' });
    await createVolunteer({ email: 'other@spoh.test', role: 'IC' });
  });

  it('lists this volunteers own sessions and marks the current one', async () => {
    const first = await openSession('ic@spoh.test');
    await openSession('ic@spoh.test');

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${first.body.accessToken as string}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
  });

  it('refuses to revoke somebody elses session', async () => {
    const mine = await openSession('ic@spoh.test');
    const theirs = await openSession('other@spoh.test');

    const theirSession = await prisma.refreshSession.findFirst({
      where: { volunteer: { email: 'other@spoh.test' } },
      select: { id: true },
    });

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${theirSession?.id ?? 'missing'}`)
      .set('Authorization', `Bearer ${mine.body.accessToken as string}`);

    expect(response.status).toBe(404);

    // And theirs still works.
    const stillFine = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${theirs.body.accessToken as string}`);
    expect(stillFine.status).toBe(200);
  });
});
