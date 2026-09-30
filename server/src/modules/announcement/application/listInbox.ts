import type { AnnouncementRecord, CommitteeRole, ListAnnouncementsQuery } from '@spoh/shared';
import { toPage, type Page } from '../../../platform/db/pagination.js';
import { eventToday } from '../../../platform/event/today.js';
import { toAnnouncementRecord } from '../data/mappers.js';
import { acknowledgedIds, findTodaysPostings, listForRecipient } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Everything addressed to the caller, newest first, one page at a time. */
export async function listInbox(
  query: ListAnnouncementsQuery,
  recipient: { volunteerId: string; role: CommitteeRole; scope: EventScope },
): Promise<Page<AnnouncementRecord>> {
  // Station targeting matches every station this volunteer is rostered at
  // today, not just the one they happen to be standing in right now.
  const { scope } = recipient;
  const today = await eventToday(scope, new Date());
  const assignments = await findTodaysPostings(scope, recipient.volunteerId, today);

  const rows = await listForRecipient(scope, {
    role: recipient.role,
    stationIds: [...new Set(assignments.map((a) => a.stationId))],
    eventDayIds: [...new Set(assignments.map((a) => a.eventDayId))],
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    now: new Date(),
  });
  const { data: announcements, nextCursor } = toPage(rows, query.limit);

  const acked = await acknowledgedIds(scope, {
    volunteerId: recipient.volunteerId,
    announcementIds: announcements.map((a) => a.id),
  });

  // The station's name comes with the row: one query per page, not one per
  // announcement on a list every phone polls (F03-029).
  const records = announcements.map((announcement) =>
    toAnnouncementRecord(announcement, {
      ackedByMe: acked.has(announcement.id),
      audienceCount: null,
    }),
  );

  return {
    data: query.unackedOnly
      ? records.filter((record) => record.requiresAck && !record.ackedByMe)
      : records,
    nextCursor,
  };
}
