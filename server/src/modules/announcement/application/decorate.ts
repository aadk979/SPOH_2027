import type { AnnouncementRecord } from '@spoh/shared';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, countAudience, type AnnouncementWithContext } from '../data/repo.js';

/** A single announcement as its viewer sees it: their ack, and reach. */
export async function decorate(
  announcement: AnnouncementWithContext,
  viewerId: string,
  options: { includeAudience: boolean },
): Promise<AnnouncementRecord> {
  const acked = await acknowledgedIds(viewerId, [announcement.id]);

  const audienceCount = options.includeAudience
    ? await countAudience({
        role: announcement.targetRole,
        stationId: announcement.targetStationId,
        eventDayId: announcement.targetEventDayId,
      })
    : null;

  return toAnnouncementRecord(announcement, {
    ackedByMe: acked.has(announcement.id),
    audienceCount,
  });
}
