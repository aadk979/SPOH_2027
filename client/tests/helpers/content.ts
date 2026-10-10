import type { EventContent, ContentDraftRecord, PublishedContentRecord } from '@spoh/shared';
import { TEST_EVENT } from './event';
export const GUIDE: EventContent = {
  schemaVersion: 1,
  brief: {
    escalationScript: 'Ask your IC for help.',
    fiveThings: [{ text: 'Know your station.' }],
    programmes: [],
  },
  journey: {
    steps: [{ title: 'Arrive', detail: 'Visit the welcome desk.' }],
    note: 'Counts measure different things.',
  },
  map: {
    intro: 'Find the nearest exit.',
    levels: [{ label: 'Level one', points: [{ label: 'AED by reception', kind: 'safety' }] }],
  },
  briefing: { mandatoryPoints: ['Check your posting before starting.'] },
};
export const GUIDE_DRAFT: ContentDraftRecord = {
  eventId: TEST_EVENT.id,
  version: 2,
  body: GUIDE,
  reviewedVersion: null,
  reviewedAt: null,
  publishedVersion: null,
  updatedAt: '2026-10-10T08:00:00.000Z',
};
export const PUBLISHED_GUIDE: PublishedContentRecord = {
  id: 'guide_version_1',
  eventId: TEST_EVENT.id,
  version: 1,
  draftVersion: 2,
  body: GUIDE,
  objectKey: 'content/test/guide_version_1.json',
  publishedAt: '2026-10-10T08:00:00.000Z',
  etag: '"guide-version-one"',
  path: `/events/${TEST_EVENT.id}/content?v=guide_version_1`,
  images: {},
};
