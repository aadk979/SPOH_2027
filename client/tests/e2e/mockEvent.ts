import type { ClientConfiguration, MyEvent } from '@spoh/shared';
import type { Route } from '@playwright/test';

const configuration: ClientConfiguration = {
  version: 1,
  apiBaseUrl: '',
  envLabel: 'development',
  authProvider: 'local',
  cognito: null,
};

/** Broad API mocks must explicitly provide the public bootstrap contract. */
export async function fulfillClientConfiguration(route: Route): Promise<boolean> {
  if (new URL(route.request().url()).pathname !== '/api/v1/client-config') return false;
  await route.fulfill({ json: { data: configuration } });
  return true;
}

/** The one event a mocked session belongs to: `GET /events`, and `/me`'s event. */
export const MOCK_EVENT: MyEvent = {
  id: 'evt_mock',
  slug: 'mock-event',
  name: 'Mock Event',
  timezone: 'Asia/Singapore',
  locale: 'en-SG',
  status: 'LIVE',
  role: 'VOLUNTEER',
  membershipStatus: 'ACTIVE',
  servesLegacyPaths: true,
};
