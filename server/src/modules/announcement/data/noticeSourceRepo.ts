import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Audience, Reader } from '../domain/audience.js';

export function announcementNoticeMetadata(scope: EventScope, input: { db: PrismaTransactionClient; id: string }) {
  return input.db.announcement.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, priority: true, targetRole: true, targetStationId: true,
      targetEventDayId: true, requiresAck: true, expiresAt: true } });
}
export async function noticeAnnouncementRecipient(scope: EventScope, input: {
  db: PrismaTransactionClient; personId: string; today: Date;
}) {
  const member = await input.db.eventMembership.findFirst({ where: { eventId: scope.eventId,
    personId: input.personId, person: { deactivatedAt: null },
    OR: [{ status: 'ACTIVE' }, { status: 'ENDED', event: { status: 'ARCHIVED' } }] }, select: { role: true } });
  const postings = await input.db.shiftAssignment.findMany({ where: { eventId: scope.eventId,
    volunteerId: input.personId, eventDay: { date: input.today } },
    select: { stationId: true, eventDayId: true } });
  return member ? { role: member.role, todaysStationIds: postings.map((row) => row.stationId),
    todaysEventDayIds: postings.map((row) => row.eventDayId), postings } : null;
}
export async function permittedNoticeAnnouncement(scope: EventScope, input: {
  db: PrismaTransactionClient; id: string; personId: string; now: Date; today: Date; audience: Audience;
}) {
  const row = await input.db.announcement.findFirst({ where: { eventId: scope.eventId, id: input.id,
    OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
    event: { memberships: { some: { personId: input.personId,
      OR: [{ status: 'ACTIVE' }, { status: 'ENDED', event: { status: 'ARCHIVED' } }],
      ...(input.audience.role ? { role: input.audience.role } : {}),
      person: { deactivatedAt: null, ...(input.audience.stationId || input.audience.eventDayId ? {
        shiftAssignments: { some: { eventId: scope.eventId, eventDay: { date: input.today },
          ...(input.audience.stationId ? { stationId: input.audience.stationId } : {}),
          ...(input.audience.eventDayId ? { eventDayId: input.audience.eventDayId } : {}) } },
      } : {}) },
    } } } },
    select: { body: true } });
  if (!row) return null;
  const ack = await input.db.announcementAck.findFirst({ where: { eventId: scope.eventId,
    announcementId: input.id, volunteerId: input.personId }, select: { id: true } });
  return { body: row.body, acknowledged: !!ack };
}
export function noticeAnnouncementEvent(scope: EventScope, db: PrismaTransactionClient) {
  return db.event.findUniqueOrThrow({ where: { id: scope.eventId },
    select: { timezone: true, dayBoundaryMinutes: true } });
}

export async function announcementNoticeHistory(scope: EventScope, input: {
  db: PrismaTransactionClient; personId: string; recipient: Reader; now: Date; limit: number;
}) {
  const ids = await input.db.$queryRaw<{ id: string }[]>`SELECT a.id FROM "Announcement" a
    WHERE a."eventId" = ${scope.eventId} AND (a."expiresAt" IS NULL OR a."expiresAt" > ${input.now})
      AND (a."targetRole" IS NULL OR a."targetRole"::text = ${input.recipient.role})
      AND (a."targetStationId" IS NULL OR a."targetStationId" = ANY(${[...input.recipient.todaysStationIds]}::text[]))
      AND (a."targetEventDayId" IS NULL OR a."targetEventDayId" = ANY(${[...input.recipient.todaysEventDayIds]}::text[]))
      AND NOT EXISTS (SELECT 1 FROM "Notice" n WHERE n."eventId" = a."eventId"
        AND n."recipientPersonId" = ${input.personId} AND n."sourceKind" = 'ANNOUNCEMENT'
        AND n."sourceId" = a.id AND n.kind = 'ANNOUNCEMENT_PUBLISHED')
    ORDER BY a."createdAt" DESC, a.id DESC LIMIT ${input.limit + 1}`;
  return input.db.announcement.findMany({ where: { eventId: scope.eventId, id: { in: ids.map((row) => row.id) } },
    select: { id: true, priority: true, targetRole: true, targetStationId: true,
      targetEventDayId: true, createdAt: true, expiresAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
}
