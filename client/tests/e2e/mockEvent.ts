import type { MyEvent } from '@spoh/shared';

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
