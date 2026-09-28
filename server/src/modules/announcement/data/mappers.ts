import type { AnnouncementRecord } from '@spoh/shared';
import type { AnnouncementWithContext } from './repo.js';

export function toAnnouncementRecord(
  announcement: AnnouncementWithContext,
  context: { stationName: string | null; ackedByMe: boolean; audienceCount: number | null },
): AnnouncementRecord {
  return {
    id: announcement.id,
    body: announcement.body,
    priority: announcement.priority,
    targetRole: announcement.targetRole,
    targetStationId: announcement.targetStationId,
    targetStationName: context.stationName,
    targetEventDayId: announcement.targetEventDayId,
    requiresAck: announcement.requiresAck,
    authorId: announcement.authorId,
    authorName: announcement.author.displayName,
    createdAt: announcement.createdAt.toISOString(),
    expiresAt: announcement.expiresAt?.toISOString() ?? null,
    ackCount: announcement._count.acks,
    ackedByMe: context.ackedByMe,
    audienceCount: context.audienceCount,
  };
}
