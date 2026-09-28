import type { AnnouncementRecord, CommitteeRole } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { eventDayAnchor, singaporeDateString } from '../../../platform/time/index.js';
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
  reader: { volunteerId: string; role: CommitteeRole },
): Promise<AnnouncementRecord> {
  const existing = await findAnnouncementById(announcementId);
  if (!existing) throw new NotFoundError('Announcement');

  const postings = await findTodaysPostings(
    reader.volunteerId,
    eventDayAnchor(singaporeDateString()),
  );
  const addressed = reaches(audienceOf(existing), {
    role: reader.role,
    todaysStationIds: postings.map((posting) => posting.stationId),
    todaysEventDayIds: postings.map((posting) => posting.eventDayId),
  });
  if (!addressed) throw new NotFoundError('Announcement');

  await acknowledge(announcementId, reader.volunteerId);

  const refreshed = await findAnnouncementById(announcementId);
  if (!refreshed) throw new NotFoundError('Announcement');

  return decorate(refreshed, reader.volunteerId, null);
}
