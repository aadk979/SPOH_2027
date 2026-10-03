import type {
  AnnouncementDraftRecord,
  AnnouncementPublicationScheduleRecord,
  MeResponse,
} from '@spoh/shared';
import { TEST_EVENT } from './event';

export const PRIVATE_DRAFT: AnnouncementDraftRecord = {
  id: 'private-draft-fixture',
  eventId: TEST_EVENT.id,
  authorId: 'draft-author-fixture',
  authorMembershipId: 'draft-member-fixture',
  body: 'Private synthetic message',
  priority: 'INFO',
  target: { role: 'ADMIN' },
  requiresAck: false,
  version: 2,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  expiresAt: null,
  publishedAt: null,
  publishedAnnouncementId: null,
};
export const PRIVATE_SCHEDULE: AnnouncementPublicationScheduleRecord = {
  id: 'private-schedule-fixture',
  eventId: TEST_EVENT.id,
  draftId: PRIVATE_DRAFT.id,
  draftVersion: 2,
  runAt: '2027-01-07T01:30:45.123Z',
  scheduledFor: '2027-01-07T01:30:45.123Z',
  status: 'PENDING',
  version: 3,
  createdAt: '2027-01-01T00:00:00.000Z',
  completedAt: null,
  lastError: null,
};
export const DRAFT_ME = {
  event: TEST_EVENT,
  capabilities: ['announcement.station.send', 'announcement.event.send'],
  currentAssignment: { station: { id: 'draft-station-fixture', name: 'Fixture station' } },
} as unknown as MeResponse;
