import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const capture = vi.hoisted(() => ({ lines: [] as string[],
  databaseEvents: new Map<string, (event: unknown) => void>() }));

vi.mock('../../src/config/env.js', () => ({ isProduction: true, isTest: false, env: {
  NODE_ENV: 'production', LOG_LEVEL: 'info', TRUST_PROXY_HOPS: 0,
  CORS_ALLOWED_ORIGINS: ['https://client.synthetic.example'],
  DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
  DATABASE_POOL_MAX: 1, DATABASE_POOL_MIN: 0,
} }));

// Preserve the real Pino implementation and all production options; replace only its sink.
vi.mock('pino', async (original) => {
  const actual = await original<typeof import('pino')>();
  return { ...actual, pino: (options: import('pino').LoggerOptions) => actual.pino(options, {
    write(line: string) { capture.lines.push(line); },
  }) };
});

// No database query occurs: this captures the actual client's event subscriptions.
vi.mock('../../src/generated/prisma/client.js', async (original) => {
  const actual = await original<typeof import('../../src/generated/prisma/client.js')>();
  return { ...actual, PrismaClient: class {
    constructor(_options: unknown) {}
    $on(level: string, listener: (event: unknown) => void) { capture.databaseEvents.set(level, listener); }
    $extends(_extension: unknown) { return this; }
  } };
});

vi.mock('../../src/app/routes.js', async () => {
  const { Router } = await import('express');
  return { createApiRouter() {
    const router = Router();
    router.get('/oauth/callback', (_req, res) => {
      res.cookie('synthetic_refresh', 'refresh-cookie-SENTINEL');
      res.redirect('https://client.synthetic.example/landing?auth_code=location-code-SENTINEL&auth_state=location-state-SENTINEL');
    });
    router.get('/entities/:id', (_req, res) => { res.json({ ok: true }); });
    return router;
  } };
});
vi.mock('../../src/modules/health/index.js', async () => {
  const { Router } = await import('express');
  return { healthRouter: Router() };
});
vi.mock('../../src/modules/branding/index.js', () => ({ publicBrandingForSlug: vi.fn() }));

import { logger } from '../../src/platform/logger/index.js';
import { createApp } from '../../src/app/createApp.js';
import '../../src/platform/db/client.js';
import { exchangeCode } from '../../src/modules/auth/application/hostedSignIn.js';
import { dispatch } from '../../src/modules/notification/application/dispatch.js';

const records = () => capture.lines.flatMap((line) => line.trim().split('\n').map((part) =>
  JSON.parse(part) as Record<string, unknown>));
const text = () => capture.lines.join('');
beforeEach(() => { capture.lines.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('final production JSON diagnostic output', () => {
  it('keeps private notification title, body and collapse tag out of the actual sink', async () => {
    await dispatch({ eventId: 'synthetic-event' }, { kind: 'announcement.operational', priority: 'INFO',
      title: 'private-title-SENTINEL', body: 'private-body-SENTINEL', tag: 'private-tag-SENTINEL',
      url: '/inbox', audience: { volunteerIds: [], everyone: false } });
    expect(records()).toContainEqual(expect.objectContaining({ kind: 'announcement.operational', recipients: 0,
      msg: 'notification dispatch attempted' }));
    expect(text()).not.toContain('SENTINEL');
  });
  it('logs an actual redirect status/path without OAuth query, Location, cookies or authorization values', async () => {
    const response = await request(createApp())
      .get('/api/v1/oauth/callback?code=query-code-SENTINEL&state=query-state-SENTINEL&auth_code=query-handoff-SENTINEL')
      .set('Authorization', 'Bearer authorization-SENTINEL')
      .set('Cookie', 'synthetic=cookie-SENTINEL');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('location-code-SENTINEL');
    const output = records();
    expect(output).toContainEqual(expect.objectContaining({
      req: expect.objectContaining({ method: 'GET', path: '/oauth/callback' }),
      res: { statusCode: 302 },
    }));
    for (const secret of ['query-code-SENTINEL', 'query-state-SENTINEL', 'query-handoff-SENTINEL',
      'authorization-SENTINEL', 'cookie-SENTINEL', 'refresh-cookie-SENTINEL',
      'location-code-SENTINEL', 'location-state-SENTINEL']) expect(text()).not.toContain(secret);
  });

  it('excludes credentials and private identifiers placed in matched or unknown URL paths', async () => {
    await request(createApp()).get('/api/v1/entities/private-path-SENTINEL').expect(200);
    await request(createApp()).get('/api/v1/unknown/private-unknown-path-SENTINEL').expect(404);
    const output = records();
    expect(output).toContainEqual(expect.objectContaining({ req: expect.objectContaining({ path: '/entities/:id' }) }));
    expect(output).toContainEqual(expect.objectContaining({ req: expect.objectContaining({ path: '[unmatched]' }) }));
    expect(text()).not.toContain('SENTINEL');
  });

  it('serializes actual Error/cause values to safe categories and censors explicit credential/query fields', () => {
    const cause = new Error('provider-body-SENTINEL');
    const error = new Error('SQL-password-SENTINEL', { cause });
    Object.assign(error, { params: ['error-parameter-SENTINEL'], responseBody: 'raw-body-SENTINEL' });
    logger.error({ err: error, cause, password: 'password-SENTINEL', token: 'token-SENTINEL',
      key: 'request-key-SENTINEL', prisma: { query: 'query-SENTINEL', parameters: 'parameters-SENTINEL' } },
    'synthetic operation failed');
    expect(records()).toEqual([expect.objectContaining({
      err: { category: 'operation-failed' }, cause: { category: 'operation-failed' },
      password: '[redacted]', token: '[redacted]', key: '[redacted]', prisma: '[redacted]',
    })]);
    expect(text()).not.toContain('SENTINEL');
  });

  it.each(['warn', 'error'])('drops the actual subscribed Prisma %s event diagnostic payload', (level) => {
    const listener = capture.databaseEvents.get(level);
    expect(listener).toBeTypeOf('function');
    listener!({ message: 'database-message-SENTINEL', target: 'database-target-SENTINEL',
      query: 'SELECT database-query-SENTINEL', params: 'database-params-SENTINEL' });
    expect(records()).toEqual([expect.objectContaining({ category: 'database', msg: `prisma ${level === 'warn' ? 'warning' : 'error'}` })]);
    expect(text()).not.toContain('SENTINEL');
  });

  it('logs a real failed provider exchange as status/category without reading or logging the response body', async () => {
    const body = vi.fn().mockResolvedValue('provider-response-body-SENTINEL');
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: body, json: body });
    vi.stubGlobal('fetch', fetch);
    expect(await exchangeCode({ domain: 'https://identity.synthetic.example', clientId: 'synthetic-client',
      appBaseUrl: 'https://api.synthetic.example' }, {
      code: 'authorization-code-SENTINEL', verifier: 'pkce-verifier-SENTINEL',
    })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      redirect: 'error', signal: expect.any(AbortSignal), method: 'POST',
    }));
    expect(body).not.toHaveBeenCalled();
    expect(records()).toEqual([expect.objectContaining({ status: 400, category: 'identity-provider',
      msg: 'Cognito token exchange failed' })]);
    expect(text()).not.toContain('SENTINEL');
  });
});
