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
    expect(env.SHIFT_HOURS_ALWAYS_OPEN).toBe(false);
  });

  it('refuses the local bypass and a non-TLS database in production, auth first', () => {
    const message = messageOf(() => parseEnv({ ...DEV, NODE_ENV: 'production' }));
    expect(message).toContain('AUTH_PROVIDER');
    expect(message).toContain('sslmode=require');
    expect(message.indexOf('AUTH_PROVIDER')).toBeLessThan(message.indexOf('sslmode=require'));
  });

  it('refuses half a VAPID pair and a bad campus range', () => {
    const message = messageOf(() =>
      parseEnv({ ...DEV, VAPID_PUBLIC_KEY: 'key', ATTENDANCE_SP_CIDRS: '10.0.0.0/33' }),
    );
    expect(message).toContain('VAPID_PUBLIC_KEY');
    expect(message).toContain('Invalid campus CIDR');
  });

  it('knows every key it reads', () => {
    expect(ENV_KEYS).toHaveLength(35);
    expect(new Set(ENV_KEYS).size).toBe(ENV_KEYS.length);
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
