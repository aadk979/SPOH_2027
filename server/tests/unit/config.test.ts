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

  it('knows every key it reads', () => {
    expect(ENV_KEYS).toHaveLength(27);
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
