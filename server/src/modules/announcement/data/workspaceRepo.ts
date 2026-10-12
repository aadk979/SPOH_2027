import type { CommitteeRole, RecordsFilter } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';
import type { noticeAnnouncementRecipient } from './noticeSourceRepo.js';

const metadata = { id: true, priority: true, targetRole: true, targetStationId: true,
  targetEventDayId: true, authorId: true, requiresAck: true, createdAt: true, expiresAt: true } as const;
export interface AnnouncementWorkspaceAudience { recipient: Awaited<ReturnType<typeof noticeAnnouncementRecipient>>; senderStationIds: string[];
  senderEvent: boolean; archiveMetadata: boolean; eventId: string; personId: string; membershipId?: string; now: Date; today: Date }
function postingWhere(input: AnnouncementWorkspaceAudience): Prisma.AnnouncementWhereInput[] {
  return (input.recipient?.postings ?? []).map((posting) => ({ AND: [
    { OR: [{ targetStationId: null }, { targetStationId: posting.stationId }] },
    { OR: [{ targetEventDayId: null }, { targetEventDayId: posting.eventDayId }] },
    { event: { memberships: { some: { id: input.membershipId, personId: input.personId,
      person: { shiftAssignments: { some: { eventId: input.eventId, stationId: posting.stationId,
        eventDayId: posting.eventDayId, eventDay: { date: input.today } } } } } } } },
  ] }));
}
function recipientWhere(input: AnnouncementWorkspaceAudience): Prisma.AnnouncementWhereInput | null {
  if (!input.recipient) return null;
  return { AND: [
    { OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }] },
    { OR: [{ targetRole: null }, { targetRole: input.recipient.role }] },
    { OR: [{ targetStationId: null, targetEventDayId: null }, ...postingWhere(input)] },
    { event: { memberships: { some: { id: input.membershipId, personId: input.personId, role: input.recipient.role,
      person: { deactivatedAt: null }, OR: [{ status: 'ACTIVE' }, { status: 'ENDED', event: { status: 'ARCHIVED' } }] } } } },
  ] };
}
function senderWhere(input: AnnouncementWorkspaceAudience): Prisma.AnnouncementWhereInput | null {
  const targets: Prisma.AnnouncementWhereInput[] = [];
  if (input.senderEvent) targets.push({ targetStationId: null });
  if (input.senderStationIds.length) targets.push({ targetStationId: { in: input.senderStationIds } });
  return targets.length ? { authorId: input.personId, OR: targets,
    event: { status: { not: 'ARCHIVED' }, memberships: { some: { id: input.membershipId,
      personId: input.personId, status: 'ACTIVE', person: { deactivatedAt: null } } } } } : null;
}
function queryWhere(query: string): Prisma.AnnouncementWhereInput {
  if ('ANNOUNCEMENT'.includes(query.toUpperCase())) return {};
  const priorities = (['INFO', 'OPERATIONAL', 'URGENT'] as const).filter((value) => value.includes(query.toUpperCase()));
  return { OR: [{ id: { contains: query, mode: 'insensitive' } }, { priority: { in: priorities } }] };
}
function filterWhere(filter: Extract<RecordsFilter, { kind: 'announcements' }> | undefined): Prisma.AnnouncementWhereInput {
  if (!filter) return {};
  return { ...(filter.stationId ? { targetStationId: filter.stationId } : {}),
    ...(filter.eventDayId ? { targetEventDayId: filter.eventDayId } : {}),
    ...(filter.personId ? { authorId: filter.personId } : {}), ...(filter.priority ? { priority: filter.priority } : {}) };
}
export function announcementWorkspaceWhere(context: ReadDatabase, input: { audience: AnnouncementWorkspaceAudience;
  filter?: Extract<RecordsFilter, { kind: 'announcements' }>; time?: Prisma.DateTimeFilter; query?: string }): Prisma.AnnouncementWhereInput {
  const visibility: Prisma.AnnouncementWhereInput[] = [];
  const recipient = recipientWhere(input.audience); const sender = senderWhere(input.audience);
  if (recipient) visibility.push(recipient); if (sender) visibility.push(sender);
  if (input.audience.archiveMetadata) visibility.push({ event: { status: 'ARCHIVED' } });
  return { eventId: context.scope.eventId, AND: [{ OR: visibility }, filterWhere(input.filter),
    ...(input.query ? [queryWhere(input.query)] : [])], ...(input.time ? { createdAt: input.time } : {}) };
}
export function announcementWorkspaceMetadata(context: ReadDatabase, id: string, visibility?: Prisma.AnnouncementWhereInput) {
  return context.db.announcement.findFirst({ where: { AND: [{ eventId: context.scope.eventId, id }, visibility ?? {}] }, select: metadata });
}
/** The caller proves body visibility first. These queries contain no names or person lists. */
export async function announcementWorkspaceAcknowledgements(context: ReadDatabase, input: {
  id: string; personId: string; own: boolean; aggregate: boolean; asOf: Date;
}) {
  const where = { eventId: context.scope.eventId, announcementId: input.id, ackedAt: { lte: input.asOf } };
  const own = await (input.own ? context.db.announcementAck.findFirst({ where: { ...where, volunteerId: input.personId }, select: { ackedAt: true } }) : null);
  const count = await (input.aggregate ? context.db.announcementAck.count({ where }) : null);
  return { own: own ? own.ackedAt.toISOString() : null, count };
}
export function ownSenderWorkspaceBody(context: ReadDatabase, input: {
  id: string; personId: string; membershipId: string; role: CommitteeRole;
}) {
  return context.db.announcement.findFirst({ where: { eventId: context.scope.eventId, id: input.id, authorId: input.personId,
    event: { status: { not: 'ARCHIVED' }, memberships: { some: { id: input.membershipId, personId: input.personId,
      role: input.role, status: 'ACTIVE', person: { deactivatedAt: null } } } } }, select: { body: true } });
}
export async function announcementWorkspacePage(context: ReadDatabase, input: {
  where: Prisma.AnnouncementWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.announcement.findFirst({ where: { AND: [input.where, { id: input.cursor }] },
    select: { id: true, createdAt: true } }) : null;
  const count = await (context.db.announcement.count({ where: input.where }));
  const rows = await (context.db.announcement.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.createdAt } : null, 'createdAt')] },
    select: metadata, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function workspaceAnnouncementEvent(context: ReadDatabase) {
  return context.db.event.findUniqueOrThrow({ where: { id: context.scope.eventId },
    select: { status: true, timezone: true, dayBoundaryMinutes: true } });
}
