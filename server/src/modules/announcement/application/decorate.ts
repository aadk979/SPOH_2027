import type { AnnouncementRecord } from '@spoh/shared';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, type AnnouncementWithContext } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** A single announcement as its viewer sees it: their ack, and reach when known. */
export async function decorate(
  scope: EventScope,
  announcement: AnnouncementWithContext,
  view: { viewerId: string; audienceCount: number | null },
): Promise<AnnouncementRecord> {
  const { viewerId, audienceCount } = view;
  const acked = await acknowledgedIds(scope, {
    volunteerId: viewerId,
    announcementIds: [announcement.id],
  });
  return toAnnouncementRecord(announcement, {
    ackedByMe: acked.has(announcement.id),
    audienceCount,
  });
}
