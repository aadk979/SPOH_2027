import type { AnnouncementRecord } from '@spoh/shared';
import { findStationById } from '../../station/index.js';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, countAudience, type AnnouncementWithContext } from '../data/repo.js';

/** A single announcement as its viewer sees it: station name, their ack, and reach. */
export async function decorate(
  announcement: AnnouncementWithContext,
  viewerId: string,
  options: { includeAudience: boolean },
): Promise<AnnouncementRecord> {
  const station = announcement.targetStationId
    ? await findStationById(announcement.targetStationId)
    : null;

  const acked = await acknowledgedIds(viewerId, [announcement.id]);

  const audienceCount = options.includeAudience
    ? await countAudience({
        role: announcement.targetRole,
        stationId: announcement.targetStationId,
        eventDayId: announcement.targetEventDayId,
      })
    : null;

  return toAnnouncementRecord(announcement, {
    stationName: station?.name ?? null,
    ackedByMe: acked.has(announcement.id),
    audienceCount,
  });
}
