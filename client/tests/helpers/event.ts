import type { CaptureCategoryRecord, MyEvent } from '@spoh/shared';

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

/** The test event's capture categories: the booth's buttons (ADR-002). */
export const TEST_CATEGORIES: CaptureCategoryRecord[] = [
  { code: 'SEC_3', label: 'Sec 3' },
  { code: 'SEC_4', label: 'Sec 4' },
  { code: 'PARENT_GUARDIAN', label: 'Parent / Guardian' },
  { code: 'OTHER', label: 'Other' },
];
