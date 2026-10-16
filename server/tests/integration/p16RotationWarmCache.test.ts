import { createHash, randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer } from '../helpers/fixtures.js';

const app = createApp();
const origin = 'http://localhost:3000';
beforeEach(async () => {
  await resetDatabase();
  await createVolunteer({ email: 'rotation-warm-cache@example.test', role: 'IC' });
});

it.each(['refresh', 'recover'] as const)(
  '%s stops a warmed old access SID immediately while the replacement stays usable',
  async (operation) => {
    const opened = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', origin)
      .send({ email: 'rotation-warm-cache@example.test' })
      .expect(201);
    const oldToken = opened.body.accessToken as string;
    const oldSid = decodeJwt(oldToken).sid as string;
    const headers: unknown = opened.headers['set-cookie'];
    const cookies = Array.isArray(headers)
      ? (headers as string[])
      : typeof headers === 'string'
        ? [headers]
        : [];
    const cookie = cookies.find((value) => value.startsWith('spoh_refresh='))!.split(';')[0]!;
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${oldToken}`).expect(200);
    let newToken: string;
    if (operation === 'refresh') {
      const next = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', origin)
        .set('Cookie', cookie)
        .expect(200);
      newToken = next.body.accessToken as string;
    } else {
      const verifier = randomBytes(32).toString('base64url');
      const state = randomBytes(32).toString('base64url');
      const recovered = await request(app)
        .get('/api/v1/auth/recover')
        .set('Cookie', cookie)
        .query({
          returnTo: origin + '/',
          challenge: createHash('sha256').update(verifier).digest('base64url'),
          state,
        })
        .expect(302);
      const destination = new URL(recovered.headers.location as string);
      expect(destination.searchParams.get('auth_state')).toBe(state);
      const code = destination.searchParams.get('auth_code');
      expect(code).toEqual(expect.any(String));
      const next = await request(app)
        .post('/api/v1/auth/handoff')
        .set('Origin', origin)
        .send({ code, verifier })
        .expect(200);
      newToken = next.body.accessToken as string;
    }
    const newSid = decodeJwt(newToken).sid as string;
    expect(newSid).not.toBe(oldSid);
    const old = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: oldSid } });
    const next = await rawDb.refreshSession.findUniqueOrThrow({ where: { id: newSid } });
    expect(old).toMatchObject({ revokedReason: 'rotated', replacedById: newSid });
    expect(old.revokedAt).not.toBeNull();
    expect(next).toMatchObject({ familyId: old.familyId, revokedAt: null });
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${newToken}`).expect(200);
    // No sleep, clock advance or explicit test-side cache invalidation.
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${oldToken}`).expect(401);
  },
);
