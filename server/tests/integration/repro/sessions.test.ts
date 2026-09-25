import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { resetDatabase } from '../../helpers/db.js';
import { createVolunteer } from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: refresh sessions. Skipped until P06/P12 fixes them;
 * each asserts the correct behaviour and fails today.
 */

const app = createApp();
const COOKIE = 'spoh_refresh';

function cookieValue(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  const jar = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const entry = jar.find((line) => line.startsWith(`${COOKIE}=`)) ?? '';
  return entry.split(';')[0]?.slice(COOKIE.length + 1) ?? '';
}

function refresh(cookie: string): request.Test {
  return request(app).post('/api/v1/auth/refresh').set('Cookie', `${COOKIE}=${cookie}`);
}

async function signIn(): Promise<{ cookie: string; accessToken: string }> {
  const response = await request(app).post('/api/v1/auth/session').send({ email: 'ic@repro.test' });
  expect(response.status).toBe(201);
  return { cookie: cookieValue(response), accessToken: response.body.accessToken as string };
}

describe('refresh sessions (P03 repros)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await createVolunteer({ email: 'ic@repro.test', role: 'IC' });
  });

  // F02-032
  it.skip('keeps the session when two tabs refresh with the same cookie at once', async () => {
    const { cookie } = await signIn();

    // Tab A refreshes first and receives the rotated cookie.
    const tabA = await refresh(cookie);
    expect(tabA.status).toBe(200);
    const rotated = cookieValue(tabA);

    // Tab B's request left before tab A's response landed, so it still carries
    // the old cookie. Today this is treated as token theft.
    await refresh(cookie);

    // The session tab A now holds must still work.
    const next = await refresh(rotated);
    expect(next.status).toBe(200);
  });

  // F03-010
  it.skip('never leaves two live sessions behind one rotated token', async () => {
    // A race: five families, each refreshed three times at once.
    const winners: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      const { cookie } = await signIn();
      const outcomes = await Promise.all([refresh(cookie), refresh(cookie), refresh(cookie)]);
      winners.push(outcomes.filter((response) => response.status === 200).length);
    }
    expect(winners).toEqual([1, 1, 1, 1, 1]);

    const livePerFamily = await prisma.refreshSession.groupBy({
      by: ['familyId'],
      where: { revokedAt: null },
      _count: { _all: true },
    });
    expect(livePerFamily.every((family) => family._count._all <= 1)).toBe(true);
  });

  // F03-009
  it.skip('stops an access token as soon as its session is revoked from another device', async () => {
    const phone = await signIn();
    const laptop = await signIn();

    // The phone is in use, so its session is in the liveness cache.
    const before = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${phone.accessToken}`);
    expect(before.status).toBe(200);

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${laptop.accessToken}`);
    const phoneSession = (sessions.body.data as Array<{ id: string; current: boolean }>).find(
      (session) => !session.current,
    );
    expect(phoneSession).toBeDefined();

    const revoke = await request(app)
      .delete(`/api/v1/auth/sessions/${phoneSession?.id ?? ''}`)
      .set('Authorization', `Bearer ${laptop.accessToken}`);
    expect(revoke.status).toBe(204);

    const after = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${phone.accessToken}`);
    expect(after.status).toBe(401);
  });
});
