import type { CreateAnnouncementRequest } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { fixedClock } from '../../../platform/time/index.js';
import { createAnnouncement } from '../data/repo.js';
import { prepareDirectPublication } from './prepareDirectPublication.js';
import { queueAnnouncementDeliveries } from './queueAnnouncementDeliveries.js';
import { publicationAudience, queuePublicationNotices } from './queuePublicationNotices.js';
import type { DirectSender } from './directSender.js';

export function publishDirectAnnouncement(input: { request: CreateAnnouncementRequest; sender: DirectSender; audit: AuditContext }) {
  return prisma.$transaction(async (tx) => {
    const { request, sender, audit } = input;
    const { now } = await prepareDirectPublication(tx, input);
    const announcement = await createAnnouncement(tx, sender.scope, { body: request.body,
      priority: request.priority, targetRole: request.target.role ?? null,
      targetStationId: request.target.stationId ?? null, targetEventDayId: request.target.eventDayId ?? null,
      requiresAck: request.requiresAck, authorId: sender.volunteerId, createdAt: now,
      expiresAt: request.expiresAt ? new Date(request.expiresAt) : null });
    const audienceCount = await queuePublicationNotices(tx, sender.scope, {
      announcement: { ...publicationAudience(announcement), ...announcement }, now });
    await queueAnnouncementDeliveries(sender.scope, { tx, announcementId: announcement.id, audit, clock: fixedClock(now) });
    await writeAudit(tx, { ...audit, action: 'announcement.send', entityType: 'Announcement', entityId: announcement.id,
      after: { priority: announcement.priority, targetRole: announcement.targetRole,
        targetStationId: announcement.targetStationId, requiresAck: announcement.requiresAck } });
    return { announcement, audienceCount };
  });
}
