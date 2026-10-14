import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bootstrapProductionAdmin } from '../../prisma/bootstrapAdmin.js';
import { createApp } from '../../src/app/createApp.js';
import { env } from '../../src/config/env.js';
import { identityProvider, localAuthIssuer } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';

const app = createApp();
const client = 'http://localhost:3000';
const hosted = {
  COGNITO_DOMAIN: 'https://bootstrap.auth.ap-southeast-1.amazoncognito.com',
  COGNITO_CLIENT_ID: 'synthetic-bootstrap-client',
  APP_BASE_URL: 'https://api.bootstrap.test',
  CLIENT_BASE_URL: client,
};
const saved = Object.fromEntries(
  Object.keys(hosted).map((key) => [key, env[key as keyof typeof hosted]]),
);
beforeEach(async () => {
  await resetDatabase();
  Object.assign(env, hosted);
});
afterEach(() => {
  Object.assign(env, saved);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function cookie(response: request.Response, name: string): string {
  const values = response.headers['set-cookie'] as unknown as string[];
  return values.find((value) => value.startsWith(name + '='))!.split(';')[0]!;
}

it('bootstraps hosted first-login MFA through a one-use handoff before any event exists', async () => {
  const organisation = await rawDb.organisation.create({
    data: {
      slug: 'hosted-bootstrap',
      name: 'Hosted bootstrap',
      appName: 'Synthetic operations',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const subject = randomUUID(),
    email = 'hosted-bootstrap@example.test',
    displayName = 'Synthetic administrator';
  vi.spyOn(CognitoIdentityProviderClient.prototype, 'send').mockImplementation(
    async () =>
      ({
        $metadata: {},
        Username: 'synthetic-bootstrap',
        Enabled: true,
        UserStatus: 'CONFIRMED',
        UserAttributes: Object.entries({
          sub: subject,
          email,
          email_verified: 'true',
          name: displayName,
        }).map(([Name, Value]) => ({ Name, Value })),
      }) as never,
  );
  const personId = await bootstrapProductionAdmin(rawDb, {
    organisationId: organisation.id,
    email,
    displayName,
    subject,
    userPoolId: 'ap-southeast-1_synthetic',
    region: 'ap-southeast-1',
    approvalReference: 'synthetic-hosted-bootstrap',
  });
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
  const provider = await localAuthIssuer!.issue({ sub: subject, groups: [] });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: provider }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  );
  const login = await request(app).get('/api/v1/auth/login').expect(302);
  const stateCookie = cookie(login, 'spoh_oauth_state'),
    verifierCookie = cookie(login, 'spoh_pkce_verifier');
  const callback = await request(app)
    .get('/api/v1/auth/callback')
    .set('Cookie', `${stateCookie}; ${verifierCookie}`)
    .query({ code: 'synthetic-code', state: stateCookie.split('=')[1] })
    .expect(302);
  expect(callback.headers.location).toBe(`${client}/`);
  const refresh = cookie(callback, 'spoh_refresh');
  await request(app)
    .post('/api/v1/auth/refresh')
    .set('Origin', client)
    .set('Cookie', refresh)
    .send({})
    .expect(401);
  const verifier = randomBytes(32).toString('base64url'),
    state = randomBytes(32).toString('base64url');
  const recovery = await request(app)
    .get('/api/v1/auth/recover')
    .set('Cookie', refresh)
    .query({
      returnTo: `${client}/`,
      state,
      challenge: createHash('sha256').update(verifier).digest('base64url'),
    })
    .expect(302);
  const target = new URL(recovery.headers.location as string),
    code = target.searchParams.get('auth_code');
  expect(target.origin).toBe(client);
  expect(target.searchParams.get('auth_state')).toBe(state);
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await request(app)
    .post('/api/v1/auth/handoff')
    .set('Origin', client)
    .send({ code, verifier: randomBytes(32).toString('base64url') })
    .expect(401);
  const opened = await request(app)
    .post('/api/v1/auth/handoff')
    .set('Origin', client)
    .send({ code, verifier })
    .expect(200);
  expect(opened.body.mfaRequired).toBe(true);
  expect(opened.body.volunteer.id).toBe(personId);
  const bearer = `Bearer ${opened.body.accessToken as string}`;
  await request(app).get('/api/v1/events/administration').set('Authorization', bearer).expect(401);
  await request(app)
    .post('/api/v1/auth/handoff')
    .set('Origin', client)
    .send({ code, verifier })
    .expect(401);
  vi.spyOn(identityProvider, 'beginMfa').mockResolvedValue('SYNTHETIC-SETUP-KEY');
  await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Origin', client)
    .set('Authorization', bearer)
    .send({})
    .expect(200);
  vi.spyOn(identityProvider, 'verifyMfa').mockResolvedValue();
  vi.mocked(identityProvider.hasMfa).mockResolvedValue(true);
  const verified = await request(app)
    .post('/api/v1/auth/mfa/verify')
    .set('Origin', client)
    .set('Authorization', bearer)
    .send({ code: '123456' })
    .expect(200);
  expect(decodeJwt(verified.body.accessToken).sid).not.toBe(decodeJwt(opened.body.accessToken).sid);
  await request(app).get('/api/v1/events/administration').set('Authorization', bearer).expect(401);
  await request(app)
    .get('/api/v1/events/administration')
    .set('Authorization', `Bearer ${verified.body.accessToken as string}`)
    .expect(200);
  expect(await rawDb.event.count()).toBe(0);
  expect(await rawDb.eventMembership.count()).toBe(0);
});
