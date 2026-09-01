import type { AnnouncementRecord, CommitteeRole } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';

/** Data access for announcements (PRODUCT_BRIEF §8). */

const announcementInclude = {
  author: { select: { displayName: true } },
  _count: { select: { acks: true } },
} satisfies Prisma.AnnouncementInclude;

export type AnnouncementWithContext = Prisma.AnnouncementGetPayload<{
  include: typeof announcementInclude;
}>;

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

export async function createAnnouncement(
  tx: PrismaTransactionClient,
  data: Prisma.AnnouncementUncheckedCreateInput,
): Promise<AnnouncementWithContext> {
  return tx.announcement.create({ data, include: announcementInclude });
}

export async function findAnnouncementById(id: string): Promise<AnnouncementWithContext | null> {
  return prisma.announcement.findUnique({ where: { id }, include: announcementInclude });
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
export async function listForRecipient(input: {
  role: Prisma.AnnouncementWhereInput['targetRole'];
  stationIds: string[];
  eventDayIds: string[];
  limit: number;
  cursor?: string;
  now: Date;
}): Promise<AnnouncementWithContext[]> {
  return prisma.announcement.findMany({
    where: {
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
    orderBy: { createdAt: 'desc' },
    take: input.limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
}

export async function acknowledgedIds(
  volunteerId: string,
  announcementIds: string[],
): Promise<Set<string>> {
  if (announcementIds.length === 0) return new Set();

  const acks = await prisma.announcementAck.findMany({
    where: { volunteerId, announcementId: { in: announcementIds } },
    select: { announcementId: true },
  });

  return new Set(acks.map((ack) => ack.announcementId));
}

/** Idempotent by unique constraint, so a double tap cannot inflate reach. */
export async function acknowledge(announcementId: string, volunteerId: string): Promise<void> {
  await prisma.announcementAck.upsert({
    where: { announcementId_volunteerId: { announcementId, volunteerId } },
    create: { announcementId, volunteerId },
    update: {},
  });
}

/** How many people a message was addressed to, so reach is a fraction. */
export async function countAudience(input: {
  role: CommitteeRole | null;
  stationId: string | null;
  eventDayId: string | null;
}): Promise<number> {
  return prisma.volunteer.count({
    where: {
      active: true,
      ...(input.role ? { role: input.role } : {}),
      ...(input.stationId || input.eventDayId
        ? {
            shiftAssignments: {
              some: {
                ...(input.stationId ? { stationId: input.stationId } : {}),
                ...(input.eventDayId ? { eventDayId: input.eventDayId } : {}),
              },
            },
          }
        : {}),
    },
  });
}
