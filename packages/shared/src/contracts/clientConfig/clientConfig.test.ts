import { describe, expect, it } from 'vitest';
import { ClientConfigurationSchema } from './index.js';

const LOCAL = {
  version: 1,
  apiBaseUrl: '',
  envLabel: 'development',
  authProvider: 'local',
  cognito: null,
};
const CLOUD = {
  ...LOCAL,
  apiBaseUrl: 'https://api.example.test',
  envLabel: 'staging',
  authProvider: 'cognito',
  cognito: {
    region: 'ap-southeast-1',
    userPoolId: 'test-pool',
    clientId: 'test-client',
    domain: 'https://auth.example.test',
  },
};

describe('public client configuration contract', () => {
  it('requires a versioned explicit provider and complete Cognito metadata', () => {
    expect(ClientConfigurationSchema.safeParse(LOCAL).success).toBe(true);
    expect(ClientConfigurationSchema.safeParse(CLOUD).success).toBe(true);
    expect(ClientConfigurationSchema.safeParse({ ...LOCAL, authProvider: undefined }).success).toBe(
      false,
    );
    expect(ClientConfigurationSchema.safeParse({ ...CLOUD, cognito: null }).success).toBe(false);
    expect(ClientConfigurationSchema.safeParse({ ...LOCAL, version: 2 }).success).toBe(false);
  });

  it('refuses additional fields including secret metadata at both levels', () => {
    expect(
      ClientConfigurationSchema.safeParse({ ...LOCAL, SESSION_SIGNING_SECRET: 'private' }).success,
    ).toBe(false);
    expect(
      ClientConfigurationSchema.safeParse({
        ...CLOUD,
        cognito: { ...CLOUD.cognito, clientSecret: 'private' },
      }).success,
    ).toBe(false);
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
  ])('refuses an unsafe or non-origin API address %s', (apiBaseUrl) => {
    expect(ClientConfigurationSchema.safeParse({ ...CLOUD, apiBaseUrl }).success).toBe(false);
  });
});
