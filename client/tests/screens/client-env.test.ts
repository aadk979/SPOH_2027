import { describe, expect, it } from 'vitest';
import { readClientEnv } from '@/shared/lib/env';

describe('client configuration (F03-037: no zod on every route)', () => {
  it('reads the public settings with their defaults', () => {
    expect(readClientEnv({ apiBaseUrl: 'https://api.example' })).toEqual({
      apiBaseUrl: 'https://api.example',
      envLabel: 'development',
    });
    expect(
      readClientEnv({
        apiBaseUrl: 'http://localhost:4012',
        envLabel: 'staging',
        cognitoUserPoolId: 'pool',
      }),
    ).toEqual({
      apiBaseUrl: 'http://localhost:4012',
      envLabel: 'staging',
      cognitoUserPoolId: 'pool',
    });
  });

  it('refuses to start against an API address that is not a URL', () => {
    expect(() => readClientEnv({ apiBaseUrl: 'localhost:4012/api' })).toThrow(/API base URL/);
    expect(() => readClientEnv({ apiBaseUrl: '' })).toThrow(/API base URL/);
  });

  it('treats an empty optional value as unset', () => {
    expect(readClientEnv({ apiBaseUrl: 'https://api.example', cognitoClientId: '' })).toEqual({
      apiBaseUrl: 'https://api.example',
      envLabel: 'development',
    });
  });
});
