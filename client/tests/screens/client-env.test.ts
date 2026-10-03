import { describe, expect, it } from 'vitest';
import { ClientConfigurationSchema } from '@spoh/shared';
import { readClientEnv } from '@/shared/lib/env';
import { CLOUD_CONFIGURATION, LOCAL_CONFIGURATION } from '../helpers/clientConfiguration';

describe('runtime configuration validation (F03-037: no Zod on every route)', () => {
  it.each([LOCAL_CONFIGURATION, CLOUD_CONFIGURATION])(
    'accepts complete explicit provider configuration',
    (value) => {
      expect(readClientEnv(value)).toEqual(value);
      expect(Object.isFrozen(readClientEnv(value))).toBe(true);
    },
  );
  it.each([
    {},
    null,
    { ...LOCAL_CONFIGURATION, version: 2 },
    { ...LOCAL_CONFIGURATION, authProvider: undefined },
    { ...CLOUD_CONFIGURATION, cognito: null },
    { ...CLOUD_CONFIGURATION, envLabel: 'stagng' },
    { ...LOCAL_CONFIGURATION, secret: 'private' },
    {
      ...CLOUD_CONFIGURATION,
      cognito: { ...CLOUD_CONFIGURATION.cognito, clientSecret: 'private' },
    },
    { ...LOCAL_CONFIGURATION, cognito: CLOUD_CONFIGURATION.cognito },
    { ...CLOUD_CONFIGURATION, cognito: { region: 'ap-southeast-1' } },
  ])('refuses malformed, implicit or secret-bearing configuration', (value) => {
    expect(ClientConfigurationSchema.safeParse(value).success).toBe(false);
    expect(() => readClientEnv(value)).toThrow();
  });
  it.each([
    '//api.example',
    'ftp://api.example',
    'https://user:pass@api.example',
    'https://api.example/path',
    'https://api.example?next=evil',
    'https://api.example#token',
    ' https://api.example',
    'https://api.example/',
    'https://api.example\\path',
    'https://api.example:443',
    'https://API.example',
  ])('agrees with the shared contract when refusing origin %s', (apiBaseUrl) => {
    const value = { ...CLOUD_CONFIGURATION, apiBaseUrl };
    expect(ClientConfigurationSchema.safeParse(value).success).toBe(false);
    expect(() => readClientEnv(value)).toThrow();
  });
});
