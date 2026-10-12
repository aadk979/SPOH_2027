import { AnnouncementDraftRecord, AnnouncementPublicationScheduleRecord, AnnouncementRecord, ContentDraftRecord,
  NoticeListResponse, NoticePreferenceRecord, PushConfigResponse, PublishedContentRecord, collection } from '@spoh/shared';
import { GUIDE, GUIDE_DRAFT, PUBLISHED_GUIDE } from '../helpers/content';
import { PRIVATE_DRAFT, PRIVATE_SCHEDULE } from '../helpers/announcement';
import { CAMPAIGN_NOW, CAMPAIGN_PERSON } from './campaignCore';
import type { CampaignResponse } from './campaignTypes';

export function campaignContentResponses(eventId: string): CampaignResponse[] {
  const publication = PublishedContentRecord.parse({ ...PUBLISHED_GUIDE, eventId,
    path: `/events/${eventId}/content?v=${PUBLISHED_GUIDE.id}`, body: GUIDE });
  const draft = AnnouncementDraftRecord.parse({ ...PRIVATE_DRAFT, eventId, authorId: CAMPAIGN_PERSON.id });
  const announcement = AnnouncementRecord.parse({ id: 'campaign-announcement', body: 'Welcome desk briefing begins at 10:30.',
    priority: 'OPERATIONAL', targetRole: null, targetStationId: null, targetEventDayId: null,
    requiresAck: true, authorId: CAMPAIGN_PERSON.id, authorName: CAMPAIGN_PERSON.displayName,
    createdAt: CAMPAIGN_NOW, expiresAt: null, ackedByMe: false, ackCount: 1, audienceCount: 2, targetStationName: null });
  const notice = { id: 'campaign-notice', eventId, eventName: 'Synthetic Campaign Event', eventSlug: 'mock-event',
    kind: 'ANNOUNCEMENT_PUBLISHED', priority: 'OPERATIONAL', title: 'Operational announcement',
    summary: announcement.body, detail: announcement.body, createdAt: CAMPAIGN_NOW, readAt: null,
    destination: { type: 'entity', target: { kind: 'announcement', id: announcement.id } },
    acknowledgement: { kind: 'ANNOUNCEMENT', sourceId: announcement.id, acknowledged: false, canAcknowledge: true } };
  return [
    { path: '/content', body: { data: publication } }, { path: '/content', query: { v: publication.id }, body: { data: publication } },
    { path: '/content/draft', body: { data: ContentDraftRecord.parse({ ...GUIDE_DRAFT, eventId, reviewedVersion: 2, reviewedAt: CAMPAIGN_NOW }) } },
    { path: '/content/versions', body: { data: PublishedContentRecord.array().parse([publication]) } },
    { path: '/announcements', body: { data: AnnouncementRecord.array().parse([announcement]) } },
    { path: '/announcements/drafts', query: { limit: '10' }, body: collection(AnnouncementDraftRecord).parse({ data: [draft], meta: { count: 1, nextCursor: null } }) },
    { path: `/announcements/drafts/${draft.id}/schedules`, query: { limit: '10' }, body: collection(AnnouncementPublicationScheduleRecord).parse({
      data: [{ ...PRIVATE_SCHEDULE, eventId, runAt: '2027-01-08T04:30:00.000Z', scheduledFor: '2027-01-08T04:30:00.000Z' }], meta: { count: 1, nextCursor: null } }) },
    { path: '/api/v1/notification-centre', query: { limit: '25', unreadOnly: 'false' }, body: NoticeListResponse.parse({
      data: [notice], meta: { count: 1, nextCursor: null, unreadCount: 1, unreadCountComplete: true, visibilityScanComplete: true } }) },
    { path: '/api/v1/notification-centre/preferences', body: {
      data: NoticePreferenceRecord.parse({ urgentPush: true, operationalPush: false, updatedAt: null }) } },
    { path: '/api/v1/notification-centre/device/config', body: PushConfigResponse.parse({ enabled: false, publicKey: null }) },
  ];
}
