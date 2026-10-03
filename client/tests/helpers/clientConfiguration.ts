import type { ClientConfiguration } from '@spoh/shared';

export const LOCAL_CONFIGURATION: ClientConfiguration = {
  version: 1,
  apiBaseUrl: '',
  envLabel: 'development',
  authProvider: 'local',
  cognito: null,
};
export const CLOUD_CONFIGURATION: ClientConfiguration = {
  version: 1,
  apiBaseUrl: 'https://api.example.test',
  envLabel: 'staging',
  authProvider: 'cognito',
  cognito: {
    region: 'ap-southeast-1',
    userPoolId: 'fixture-pool',
    clientId: 'fixture-client',
    domain: 'https://auth.example.test',
  },
};
