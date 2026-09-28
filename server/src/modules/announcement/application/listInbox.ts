import type { AnnouncementRecord, CommitteeRole, ListAnnouncementsQuery } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { eventDayAnchor, singaporeDateString } from '../../../platform/time/index.js';
import { findStationById } from '../../station/index.js';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, findTodaysPostings, listForRecipient } from '../data/repo.js';

/** Everything addressed to the caller, newest first, one page at a time. */
export async function listInbox(
  query: ListAnnouncementsQuery,
  recipient: { volunteerId: string; role: CommitteeRole },
): Promise<Page<AnnouncementRecord>> {
  const today = eventDayAnchor(singaporeDateString());

  // Station targeting matches every station this volunteer is rostered at
  // today, not just the one they happen to be standing in right now.
  const assignments = await findTodaysPostings(recipient.volunteerId, today);

  const rows = await listForRecipient({
    role: recipient.role,
    stationIds: [...new Set(assignments.map((a) => a.stationId))],
    eventDayIds: [...new Set(assignments.map((a) => a.eventDayId))],
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    now: new Date(),
  });
  const { data: announcements, nextCursor } = toPage(rows, query.limit);

  const acked = await acknowledgedIds(
    recipient.volunteerId,
    announcements.map((a) => a.id),
  );

  const records = await Promise.all(
    announcements.map(async (announcement) => {
      const station = announcement.targetStationId
        ? await findStationById(announcement.targetStationId)
        : null;

      return toAnnouncementRecord(announcement, {
        stationName: station?.name ?? null,
        ackedByMe: acked.has(announcement.id),
        audienceCount: null,
      });
    }),
  );

  return {
    data: query.unackedOnly
      ? records.filter((record) => record.requiresAck && !record.ackedByMe)
      : records,
    nextCursor,
  };
}
