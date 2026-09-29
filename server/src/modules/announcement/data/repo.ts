import type { CommitteeRole } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { pageArgs } from '../../../platform/db/pagination.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

/** Data access for announcements (PRODUCT_BRIEF §8). Every query names its event (ADR-001 §2). */

const announcementInclude = {
  author: { select: { displayName: true } },
  targetStation: { select: { name: true } },
  _count: { select: { acks: true } },
} satisfies Prisma.AnnouncementInclude;

export type AnnouncementWithContext = Prisma.AnnouncementGetPayload<{
  include: typeof announcementInclude;
}>;

/** The written row only: its relations are loaded after commit (F03-019). */
export async function createAnnouncement(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.AnnouncementUncheckedCreateInput, 'eventId'>,
) {
  return tx.announcement.create({
    data: {
      ...data,
      eventId: scope.eventId,
      authorMembershipId: await membershipIdOf(tx, scope, data.authorId),
    },
  });
}

export async function findAnnouncementById(
  scope: EventScope,
  id: string,
): Promise<AnnouncementWithContext | null> {
  return prisma.announcement.findUnique({
    where: { id, eventId: scope.eventId },
    include: announcementInclude,
  });
}

/**
 * Everything addressed to this caller, newest first.
 *
 * Targeting is inclusive: a null target field means "everyone", so a message
 * with no target at all reaches the whole event. Station targeting matches the
 * stations this volunteer is rostered at today rather than only the one they
 * are standing in — a message sent during the morning block should still be in
 * the inbox of the person who arrives for the afternoon.
 */
export async function listForRecipient(
  scope: EventScope,
  input: {
    role: Prisma.AnnouncementWhereInput['targetRole'];
    stationIds: string[];
    eventDayIds: string[];
    limit: number;
    cursor?: string;
    now: Date;
  },
): Promise<AnnouncementWithContext[]> {
  return prisma.announcement.findMany({
    where: {
      eventId: scope.eventId,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }] },
        { OR: [{ targetRole: null }, { targetRole: input.role }] },
        {
          OR: [
            { targetStationId: null },
            ...(input.stationIds.length ? [{ targetStationId: { in: input.stationIds } }] : []),
          ],
        },
        {
          OR: [
            { targetEventDayId: null },
            ...(input.eventDayIds.length ? [{ targetEventDayId: { in: input.eventDayIds } }] : []),
          ],
        },
      ],
    },
    include: announcementInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(input),
  });
}

/** Today's rostered stations and days for a reader, which is what station targeting matches. */
export async function findTodaysPostings(scope: EventScope, volunteerId: string, today: Date) {
  return prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, volunteerId, eventDay: { date: today } },
    select: { stationId: true, eventDayId: true },
  });
}

export async function acknowledgedIds(
  scope: EventScope,
  reader: { volunteerId: string; announcementIds: string[] },
): Promise<Set<string>> {
  const { volunteerId, announcementIds } = reader;
  if (announcementIds.length === 0) return new Set();

  const acks = await prisma.announcementAck.findMany({
    where: { eventId: scope.eventId, volunteerId, announcementId: { in: announcementIds } },
    select: { announcementId: true },
  });

  return new Set(acks.map((ack) => ack.announcementId));
}

/**
 * Idempotent by unique constraint, so a double tap cannot inflate reach.
 * Returns false when this person had already acknowledged.
 */
export async function acknowledge(
  tx: PrismaTransactionClient,
  scope: EventScope,
  ack: { announcementId: string; volunteerId: string },
): Promise<boolean> {
  const membershipId = await membershipIdOf(tx, scope, ack.volunteerId);
  const { count } = await tx.announcementAck.createMany({
    data: [{ ...ack, eventId: scope.eventId, membershipId }],
    skipDuplicates: true,
  });
  return count > 0;
}

/**
 * The ids of everyone an announcement reaches, by the rule in
 * domain/audience.ts: the role exactly, and station or day targets matched
 * against today's roster. The reach count is this list's length and the
 * urgent push goes to exactly this list, so the two cannot disagree.
 */
export async function findAudienceIds(
  scope: EventScope,
  audience: { role: CommitteeRole | null; stationId: string | null; eventDayId: string | null },
  today: Date,
): Promise<string[]> {
  const { eventId } = scope;
  const rows = await prisma.eventMembership.findMany({
    where: {
      eventId,
      status: 'ACTIVE',
      ...(audience.role ? { role: audience.role } : {}),
      ...(audience.stationId || audience.eventDayId
        ? {
            person: {
              shiftAssignments: {
                some: {
                  eventId,
                  eventDay: { date: today },
                  ...(audience.stationId ? { stationId: audience.stationId } : {}),
                  ...(audience.eventDayId ? { eventDayId: audience.eventDayId } : {}),
                },
              },
            },
          }
        : {}),
    },
    select: { personId: true },
  });
  return rows.map((row) => row.personId);
}
