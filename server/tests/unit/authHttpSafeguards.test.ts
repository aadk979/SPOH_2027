import express, { type Response } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ isProduction: true, env: {
  SESSION_COOKIE_CROSS_SITE: true, SESSION_COOKIE_DOMAIN: undefined as string | undefined,
  CORS_ALLOWED_ORIGINS: ['https://client.example'],
} }));
vi.mock('../../src/config/env.js', () => config);
beforeEach(() => { vi.resetModules(); config.isProduction = true; config.env.SESSION_COOKIE_CROSS_SITE = true;
  config.env.SESSION_COOKIE_DOMAIN = undefined; });

async function cookieApp() {
  const cookies = await import('../../src/modules/auth/http/cookies.js');
  const app = express();
  app.use(cookieParser());
  app.get('/set', (_req, res) => { cookies.setRefreshCookie(res, { refreshToken: 'synthetic-refresh',
    expiresAt: new Date('2028-01-01T00:00:00Z') }); res.sendStatus(204); });
  app.get('/oauth', (_req, res) => { cookies.setOAuthCookies(res, { state: 'state', verifier: 'verifier' }); res.sendStatus(204); });
  app.get('/clear', (_req, res) => { cookies.clearRefreshCookie(res); cookies.clearOAuthCookies(res); res.sendStatus(204); });
  app.get('/read', (req, res) => res.json({ value: cookies.readRefreshCookie(req) ?? null }));
  return app;
}

describe('production authentication cookies', () => {
  it('uses secure host-only names and the narrow auth path, while expiring the legacy name', async () => {
    const response = await request(await cookieApp()).get('/set').expect(204);
    const values = response.headers['set-cookie'] as unknown as string[];
    expect(values.find((value) => value.startsWith('__Secure-spoh_refresh=')))
      .toMatch(/Path=\/api\/v1\/auth;.*HttpOnly; Secure; SameSite=None/);
    expect(values.join('\n')).not.toMatch(/Domain=/i);
    expect(values.find((value) => value.startsWith('spoh_refresh='))).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
  it('reads only the prefixed cookie and ignores an injected legacy cookie in production', async () => {
    const app = await cookieApp();
    expect((await request(app).get('/read').set('Cookie', 'spoh_refresh=old')).body.value).toBeNull();
    expect((await request(app).get('/read').set('Cookie', '__Secure-spoh_refresh=right; spoh_refresh=wrong')).body.value).toBe('right');
  });
  it('protects OAuth state and verifier with secure, HTTP-only Lax cookies and expires both names', async () => {
    const app = await cookieApp();
    const values = (await request(app).get('/oauth')).headers['set-cookie'] as unknown as string[];
    expect(values).toHaveLength(2);
    expect(values.every((value) => value.startsWith('__Secure-') && value.includes('HttpOnly; Secure; SameSite=Lax'))).toBe(true);
    const cleared = (await request(app).get('/clear')).headers['set-cookie'] as unknown as string[];
    expect(cleared).toHaveLength(6);
    expect(cleared.every((value) => value.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
  });
  it('retains development names and explicitly configured local domain and Lax topology', async () => {
    config.isProduction = false;
    config.env.SESSION_COOKIE_CROSS_SITE = false;
    config.env.SESSION_COOKIE_DOMAIN = 'localhost';
    const response = await request(await cookieApp()).get('/set');
    const values = response.headers['set-cookie'] as unknown as string[];
    expect(values).toHaveLength(1);
    expect(values[0]).toContain('spoh_refresh=synthetic-refresh');
    expect(values[0]).toContain('Domain=localhost');
    expect(values[0]).toContain('SameSite=Lax');
    expect(values[0]).not.toContain('Secure;');
  });
});

describe('auth origin proof', () => {
  async function originApp() {
    const { assertTrustedOrigin } = await import('../../src/modules/auth/http/origin.js');
    const app = express();
    app.use(express.json());
    app.post('/auth', (req, res) => { assertTrustedOrigin(req); res.sendStatus(204); });
    app.use((error: unknown, _req: express.Request, res: Response, _next: express.NextFunction) => {
      res.status((error as { statusCode: number }).statusCode).json({ refused: true });
    });
    return app;
  }
  it.each([undefined, 'null', 'https://evil.example', 'https://client.example.evil'])('refuses unknown origin %s', async (origin) => {
    const call = request(await originApp()).post('/auth');
    if (origin) call.set('Origin', origin);
    await call.send({}).expect(403);
  });
  it('accepts the exact allowlisted origin and absent-origin same-origin JSON proof', async () => {
    const app = await originApp();
    await request(app).post('/auth').set('Origin', 'https://client.example').send({}).expect(204);
    await request(app).post('/auth').set('Sec-Fetch-Site', 'same-origin').send({}).expect(204);
  });
  it('refuses absent-origin safelisted content and cross-site metadata even with JSON', async () => {
    const app = await originApp();
    await request(app).post('/auth').set('Sec-Fetch-Site', 'same-origin').type('form').send('x=1').expect(403);
    await request(app).post('/auth').set('Sec-Fetch-Site', 'cross-site').send({}).expect(403);
    await request(app).post('/auth').set('Origin', 'null').set('Sec-Fetch-Site', 'same-origin').send({}).expect(403);
  });
});
