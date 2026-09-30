import type { MyEvent } from '@spoh/shared';

/** The event every client test's screens work in (tests/setup.ts). */
export const TEST_EVENT: MyEvent = {
  id: 'evt_test',
  slug: 'test-event',
  name: 'Test Event',
  timezone: 'Asia/Singapore',
  locale: 'en-SG',
  status: 'LIVE',
  role: 'VOLUNTEER',
  membershipStatus: 'ACTIVE',
  servesLegacyPaths: true,
};
