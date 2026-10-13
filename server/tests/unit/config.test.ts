import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENV_KEYS, parseEnv } from '../../src/config/schema.js';

/** Boot-time configuration (P06.9), from fixtures rather than process.env. */

const DEV = {
  DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027',
  AUTH_PROVIDER: 'local',
  LOCAL_AUTH_SECRET: 'dev-only-secret-change-me-at-least-32-chars',
};

const messageOf = (run: () => unknown): string => {
  try {
    run();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('configuration', () => {
  it('parses a development environment and fills the defaults', () => {
    const env = parseEnv(DEV);
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env).not.toHaveProperty('SHIFT_HOURS_ALWAYS_OPEN');
  });

  it('refuses the local bypass and a non-TLS database in production, auth first', () => {
    const message = messageOf(() => parseEnv({ ...DEV, NODE_ENV: 'production' }));
    expect(message).toContain('AUTH_PROVIDER');
    expect(message).toContain('sslmode=require');
    expect(message.indexOf('AUTH_PROVIDER')).toBeLessThan(message.indexOf('sslmode=require'));
  });

  it('keeps a pool floor, no larger than the pool', () => {
    expect(parseEnv(DEV)).toMatchObject({ DATABASE_POOL_MIN: 5, DATABASE_POOL_MAX: 25 });
    const message = messageOf(() =>
      parseEnv({ ...DEV, DATABASE_POOL_MIN: '6', DATABASE_POOL_MAX: '5' }),
    );
    expect(message).toContain('DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX');
  });

  it('refuses half a VAPID pair', () => {
    const message = messageOf(() => parseEnv({ ...DEV, VAPID_PUBLIC_KEY: 'key' }));
    expect(message).toContain('VAPID_PUBLIC_KEY');
  });

  it('reads the AVP store and its policy names, absent by default (P11.6)', () => {
    expect(parseEnv(DEV)).not.toHaveProperty('AVP_POLICY_STORE_ID');
    expect(parseEnv(DEV)).not.toHaveProperty('AVP_POLICY_NAMES');
    const env = parseEnv({
      ...DEV,
      AVP_POLICY_STORE_ID: 'store-1',
      AVP_POLICY_NAMES: '{"p-1":"grant.Report.Generate"}',
    });
    expect(env.AVP_POLICY_STORE_ID).toBe('store-1');
    expect(env.AVP_POLICY_NAMES).toEqual({ 'p-1': 'grant.Report.Generate' });
    expect(messageOf(() => parseEnv({ ...DEV, AVP_POLICY_NAMES: '[1]' }))).toContain(
      'AVP_POLICY_NAMES',
    );
  });

  it('knows every key it reads', () => {
    expect(ENV_KEYS).toHaveLength(33);
    expect(new Set(ENV_KEYS).size).toBe(ENV_KEYS.length);
  });

  it.each(['development', 'test', 'staging', 'production'])(
    'accepts the runtime deployment label %s independently of NODE_ENV',
    (label) => {
      const env = parseEnv({ ...DEV, DEPLOYMENT_ENV: label });
      expect(env.NODE_ENV).toBe('development');
      expect(env.DEPLOYMENT_ENV).toBe(label);
    },
  );

  it('rejects an unknown runtime deployment label', () => {
    expect(messageOf(() => parseEnv({ ...DEV, DEPLOYMENT_ENV: 'stagin' }))).toContain(
      'DEPLOYMENT_ENV',
    );
  });

  it.each(['https://client.example', 'https://client.example/', 'http://localhost:3000'])(
    'accepts a configured client origin %s',
    (origin) => {
      expect(parseEnv({ ...DEV, CLIENT_BASE_URL: origin }).CLIENT_BASE_URL).toBe(origin);
    },
  );

  it.each([
    '//client.example',
    'javascript:alert(1)',
    'https://user:pass@client.example',
    'https://client.example/path',
    'https://client.example?next=evil',
    'https://client.example#token',
    ' https://client.example',
    'https://client.example/a/..',
    'not-a-url',
  ])('rejects an unsafe or non-origin client destination %s', (origin) => {
    expect(messageOf(() => parseEnv({ ...DEV, CLIENT_BASE_URL: origin }))).toContain(
      'CLIENT_BASE_URL',
    );
  });
});

describe('production identity origins and signing overlap', () => {
  const PROD = { DATABASE_URL: 'postgresql://fixture:fixture@localhost:5435/spoh2027_test?sslmode=require',
    NODE_ENV: 'production', AUTH_PROVIDER: 'cognito', COGNITO_USER_POOL_ID: 'ap-southeast-1_fixture',
    COGNITO_CLIENT_ID: 'client', COGNITO_DOMAIN: 'https://fixture.auth.ap-southeast-1.amazoncognito.com',
    APP_BASE_URL: 'https://api.example', CLIENT_BASE_URL: 'https://client.example',
    CORS_ALLOWED_ORIGINS: 'https://client.example', SESSION_SIGNING_SECRET: 'current-fixture-key-with-at-least-thirty-two-chars' };
  it('accepts exact HTTPS origins and a distinct explicit signing overlap key', () => {
    expect(parseEnv({ ...PROD, SESSION_SIGNING_SECRET_PREVIOUS: 'previous-fixture-key-with-at-least-thirty-two-chars' }))
      .toMatchObject({ APP_BASE_URL: PROD.APP_BASE_URL, CLIENT_BASE_URL: PROD.CLIENT_BASE_URL });
  });
  it.each(['APP_BASE_URL', 'CLIENT_BASE_URL', 'CORS_ALLOWED_ORIGINS'])(
    'refuses HTTP %s in production even without cross-site cookies', (key) => {
      expect(messageOf(() => parseEnv({ ...PROD, [key]: 'http://plain.example' }))).toContain(key);
    });
  it.each(['https://user:pass@client.example', 'https://client.example/path', 'https://client.example/', 'null'])(
    'refuses noncanonical CORS origin %s', (origin) => {
      expect(messageOf(() => parseEnv({ ...PROD, CORS_ALLOWED_ORIGINS: origin }))).toContain('CORS_ALLOWED_ORIGINS');
    });
  it('refuses domain-scoped production cookies and identical signing overlap keys', () => {
    expect(messageOf(() => parseEnv({ ...PROD, SESSION_COOKIE_DOMAIN: '.example' }))).toContain('SESSION_COOKIE_DOMAIN');
    expect(messageOf(() => parseEnv({ ...PROD, SESSION_SIGNING_SECRET_PREVIOUS: PROD.SESSION_SIGNING_SECRET })))
      .toContain('SESSION_SIGNING_SECRET_PREVIOUS');
  });
  it.each(['http://provider.example', 'https://provider.example/token', 'https://provider.example?redirect=evil'])(
    'refuses non-origin or plaintext provider destination %s', (value) => {
      expect(messageOf(() => parseEnv({ ...PROD, COGNITO_DOMAIN: value }))).toContain('COGNITO_DOMAIN');
    });
});

describe('server/.env.example (F01-051)', () => {
  // A key is documented when it appears as `KEY=` or as a commented `# KEY=`.
  const documented = new Set(
    [
      ...readFileSync(new URL('../../.env.example', import.meta.url), 'utf8').matchAll(
        /^#? ?([A-Z][A-Z0-9_]*)=/gm,
      ),
    ].map((match) => match[1] as string),
  );

  it('documents every key the server reads', () => {
    expect(ENV_KEYS.filter((key) => !documented.has(key))).toEqual([]);
  });

  it('names no key the server does not read', () => {
    expect([...documented].filter((key) => !ENV_KEYS.includes(key))).toEqual([]);
  });
});
