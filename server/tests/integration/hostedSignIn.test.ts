import type { Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/db.js';
import { createVolunteer, type TestVolunteer } from '../helpers/fixtures.js';

/**
 * Hosted sign-in: `GET /auth/login` and `GET /auth/callback` (P06.1).
 *
 * The only sign-in path in staging and production, and the one P03.6 found
 * with no test at all: every other suite signs in through the local provider.
 * Cognito itself is not reachable from a test, so the token endpoint is a
 * stubbed `fetch`, and the access token it returns is one the local provider
 * issued, which the callback verifies through the same `authProvider` every
 * request uses. What is proven here is the route: state and PKCE, the code
 * exchange, and each way it can fail. The Cognito verifier is P12's.
 */

const HOSTED = {
  COGNITO_DOMAIN: 'https://spoh-test.auth.ap-southeast-1.amazoncognito.com',
  COGNITO_CLIENT_ID: 'test-client-id',
  APP_BASE_URL: 'https://app.spoh.test',
};

let app: Express;
let volunteer: TestVolunteer;
const saved: Partial<typeof env> = {};
const tokenEndpoint = vi.fn();

beforeAll(() => {
  for (const key of Object.keys(HOSTED) as Array<keyof typeof HOSTED>) {
    saved[key] = env[key];
    env[key] = HOSTED[key];
  }
  app = createApp();
});

afterAll(() => {
  Object.assign(env, saved);
});

beforeEach(async () => {
  await resetDatabase();
  volunteer = await createVolunteer({ email: 'hosted@signin.test', role: 'VOLUNTEER' });
  vi.stubGlobal('fetch', tokenEndpoint);
});

afterEach(() => {
  vi.unstubAllGlobals();
  tokenEndpoint.mockReset();
});

function cookiesOf(response: request.Response): string[] {
  const header = response.headers['set-cookie'] as unknown;
  if (Array.isArray(header)) return header as string[];
  return typeof header === 'string' ? [header] : [];
}

function cookieValue(response: request.Response, name: string): string | undefined {
  const cookie = cookiesOf(response).find((value) => value.startsWith(`${name}=`));
  return cookie?.split(';')[0]?.slice(name.length + 1);
}

/** Start a sign-in and return what the browser would carry back to the callback. */
async function beginLogin(): Promise<{ state: string; verifier: string; cookie: string }> {
  const response = await request(app).get('/api/v1/auth/login');
  const state = cookieValue(response, 'spoh_oauth_state') as string;
  const verifier = cookieValue(response, 'spoh_pkce_verifier') as string;
  return { state, verifier, cookie: `spoh_oauth_state=${state}; spoh_pkce_verifier=${verifier}` };
}

function callback(query: string, cookie?: string): request.Test {
  const call = request(app).get(`/api/v1/auth/callback?${query}`);
  return cookie ? call.set('Cookie', cookie) : call;
}

function tokenResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /auth/login', () => {
  it('redirects to the Hosted UI with state and a PKCE challenge', async () => {
    const response = await request(app).get('/api/v1/auth/login');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe(`${HOSTED.COGNITO_DOMAIN}/oauth2/authorize`);
    expect(location.searchParams.get('client_id')).toBe(HOSTED.COGNITO_CLIENT_ID);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${HOSTED.APP_BASE_URL}/api/v1/auth/callback`,
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(location.searchParams.get('state')).toBe(cookieValue(response, 'spoh_oauth_state'));

    const cookies = cookiesOf(response);
    for (const name of ['spoh_oauth_state', 'spoh_pkce_verifier']) {
      const cookie = cookies.find((value) => value.startsWith(`${name}=`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    }
  });

  it('answers 500 when hosted sign-in is not configured', async () => {
    env.COGNITO_DOMAIN = undefined;
    try {
      const response = await request(app).get('/api/v1/auth/login');
      expect(response.status).toBe(500);
    } finally {
      env.COGNITO_DOMAIN = HOSTED.COGNITO_DOMAIN;
    }
  });
});

describe('GET /auth/callback', () => {
  it('exchanges the code with the verifier and opens a session', async () => {
    const { state, verifier, cookie } = await beginLogin();
    tokenEndpoint.mockResolvedValueOnce(tokenResponse(200, { access_token: volunteer.token }));

    const response = await callback(`code=abc&state=${state}`, cookie);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/home`);
    expect(cookieValue(response, 'spoh_refresh')).toBeTruthy();
    expect(await prisma.refreshSession.count({ where: { volunteerId: volunteer.id } })).toBe(1);

    const [url, init] = tokenEndpoint.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(`${HOSTED.COGNITO_DOMAIN}/oauth2/token`);
    const form = new URLSearchParams(String(init.body));
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('abc');
    expect(form.get('code_verifier')).toBe(verifier);
    expect(form.get('client_id')).toBe(HOSTED.COGNITO_CLIENT_ID);
  });

  it('passes an error from the Hosted UI back to the sign-in screen', async () => {
    const response = await callback('error=access_denied');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/sign-in?error=access_denied`);
    expect(tokenEndpoint).not.toHaveBeenCalled();
  });

  it('refuses a state that does not match the cookie', async () => {
    const { cookie } = await beginLogin();

    const response = await callback('code=abc&state=forged', cookie);

    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/sign-in?error=state`);
    expect(tokenEndpoint).not.toHaveBeenCalled();
  });

  it('refuses a callback without the sign-in cookies', async () => {
    const { state } = await beginLogin();

    const response = await callback(`code=abc&state=${state}`);

    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/sign-in?error=state`);
  });

  it('reports a failed code exchange', async () => {
    const { state, cookie } = await beginLogin();
    tokenEndpoint.mockResolvedValueOnce(tokenResponse(400, { error: 'invalid_grant' }));

    const response = await callback(`code=abc&state=${state}`, cookie);

    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/sign-in?error=exchange`);
  });

  it('reports an access token that does not verify', async () => {
    const { state, cookie } = await beginLogin();
    tokenEndpoint.mockResolvedValueOnce(tokenResponse(200, { access_token: 'not-a-jwt' }));

    const response = await callback(`code=abc&state=${state}`, cookie);

    expect(response.headers.location).toBe(`${HOSTED.APP_BASE_URL}/sign-in?error=verify`);
  });

  it('reports a person who is not on the roster', async () => {
    const { state, cookie } = await beginLogin();
    await prisma.volunteer.delete({ where: { id: volunteer.id } });
    tokenEndpoint.mockResolvedValueOnce(tokenResponse(200, { access_token: volunteer.token }));

    const response = await callback(`code=abc&state=${state}`, cookie);

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(
      new RegExp(`^${HOSTED.APP_BASE_URL}/sign-in\\?error=[A-Z_]+$`),
    );
    expect(cookieValue(response, 'spoh_refresh')).toBeUndefined();
  });
});
