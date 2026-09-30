import type { AnnouncementRecord, CommitteeRole } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { eventToday } from '../../../platform/event/today.js';
import { acknowledge, findAnnouncementById, findTodaysPostings } from '../data/repo.js';
import { audienceOf, reaches } from '../domain/audience.js';
import { decorate } from './decorate.js';

/**
 * Acknowledge an announcement the reader was sent. Outside its audience the
 * answer is 404, as for an id that does not exist: holding an id must not
 * reveal a message meant for another station or role, nor count its reader as
 * having seen it (F04-005).
 */
export async function acknowledgeAnnouncement(
  announcementId: string,
  reader: ActorContext & { role: CommitteeRole },
): Promise<AnnouncementRecord> {
  const { scope } = reader;
  const existing = await findAnnouncementById(scope, announcementId);
  if (!existing) throw new NotFoundError('Announcement');

  const today = await eventToday(scope, new Date());
  const postings = await findTodaysPostings(scope, reader.volunteerId, today);
  const addressed = reaches(audienceOf(existing), {
    role: reader.role,
    todaysStationIds: postings.map((posting) => posting.stationId),
    todaysEventDayIds: postings.map((posting) => posting.eventDayId),
  });
  if (!addressed) throw new NotFoundError('Announcement');

  await prisma.$transaction(async (tx) => {
    // Every mutation is audited; a second tap is a no-op and writes no second row (F03-018).
    const ack = { announcementId, volunteerId: reader.volunteerId };
    if (!(await acknowledge(tx, scope, ack))) return;
    await writeAudit(tx, {
      ...reader.audit,
      action: 'announcement.ack',
      entityType: 'Announcement',
      entityId: announcementId,
      after: { acknowledgedBy: reader.volunteerId },
    });
  });

  const refreshed = await findAnnouncementById(scope, announcementId);
  if (!refreshed) throw new NotFoundError('Announcement');

  return decorate(scope, refreshed, { viewerId: reader.volunteerId, audienceCount: null });
}
