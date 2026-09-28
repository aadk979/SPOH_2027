import type { AnnouncementRecord } from '@spoh/shared';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, type AnnouncementWithContext } from '../data/repo.js';

/** A single announcement as its viewer sees it: their ack, and reach when known. */
export async function decorate(
  announcement: AnnouncementWithContext,
  viewerId: string,
  audienceCount: number | null,
): Promise<AnnouncementRecord> {
  const acked = await acknowledgedIds(viewerId, [announcement.id]);
  return toAnnouncementRecord(announcement, {
    ackedByMe: acked.has(announcement.id),
    audienceCount,
  });
}
