import type { AnnouncementPriority, AnnouncementTarget, CommitteeRole } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { pageArgs } from '../../../platform/db/pagination.js';

export async function lockDraftEvent(scope: EventScope, tx: PrismaTransactionClient) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true, timezone: true, dayBoundaryMinutes: true },
  });
}

export function findOwnDraft(
  scope: EventScope,
  input: { id: string; authorId: string },
  tx: Pick<PrismaTransactionClient, 'announcementDraft'> = prisma,
) {
  return tx.announcementDraft.findFirst({ where: { eventId: scope.eventId, ...input } });
}

export function listOwnDraftRows(
  scope: EventScope,
  input: { authorId: string; limit: number; cursor?: string },
) {
  return prisma.announcementDraft.findMany({
    where: { eventId: scope.eventId, authorId: input.authorId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(input),
  });
}

export function currentDraftAuthor(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; personId: string; membershipId: string },
) {
  return input.tx.eventMembership.findFirstOrThrow({
    where: { eventId: scope.eventId, id: input.membershipId, personId: input.personId },
    select: { role: true },
  });
}

export async function validDraftTargets(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; target: AnnouncementTarget },
) {
  const { tx, target } = input;
  const station =
    !target.stationId ||
    !!(await tx.station.findFirst({
      where: { eventId: scope.eventId, id: target.stationId },
      select: { id: true },
    }));
  const day =
    !target.eventDayId ||
    !!(await tx.eventDay.findFirst({
      where: { eventId: scope.eventId, id: target.eventDayId },
      select: { id: true },
    }));
  return { station, day };
}

export function draftAuthorStations(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; personId: string; today: Date },
) {
  return input.tx.shiftAssignment.findMany({
    where: { eventId: scope.eventId, volunteerId: input.personId, eventDay: { date: input.today } },
    select: { stationId: true },
  });
}

export interface DraftContent {
  body: string;
  priority: AnnouncementPriority;
  targetRole: CommitteeRole | null;
  targetStationId: string | null;
  targetEventDayId: string | null;
  requiresAck: boolean;
  expiresAt: Date | null;
}

export function insertDraft(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    authorId: string;
    authorMembershipId: string;
    data: DraftContent;
    now: Date;
  },
) {
  return input.tx.announcementDraft.create({
    data: {
      eventId: scope.eventId,
      authorId: input.authorId,
      authorMembershipId: input.authorMembershipId,
      ...input.data,
      createdAt: input.now,
      updatedAt: input.now,
    },
  });
}

export function replaceDraft(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    expectedVersion: number;
    data: DraftContent;
    now: Date;
  },
) {
  return input.tx.announcementDraft.update({
    where: { eventId: scope.eventId, id: input.id, version: input.expectedVersion },
    data: { ...input.data, version: { increment: 1 }, updatedAt: input.now },
  });
}
