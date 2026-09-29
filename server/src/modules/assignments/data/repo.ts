import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Data access for shift assignments: who is rostered where, on which day, in
 * which block. The unique key is (volunteer, day, block): one person cannot be
 * in two places in the same block. Every query names its event (ADR-001 §2).
 */

export const assignmentInclude = {
  volunteer: { select: { displayName: true, phone: true } },
  station: { select: { name: true } },
  eventDay: { select: { date: true } },
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithNames = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

type Block = Prisma.ShiftAssignmentUncheckedCreateInput['block'];

/**
 * What an assignment row points at besides the old columns (P09.5): the event,
 * the person's membership of it, and the day's shift for the block. Every
 * writer of assignments goes through this, so the new columns never lag.
 */
export async function assignmentLinks(
  tx: PrismaTransactionClient,
  scope: EventScope,
  slot: { volunteerId: string; eventDayId: string; block: Block },
): Promise<{ eventId: string; membershipId: string | null; shiftId: string | null }> {
  const { eventId } = scope;
  // One after the other: a transaction has one connection, and parallel queries
  // on it overlap (F03-019).
  const membership = await tx.eventMembership.findUnique({
    where: { eventId_personId: { eventId, personId: slot.volunteerId } },
    select: { id: true },
  });
  const shift = await tx.shift.findFirst({
    where: { eventId, eventDayId: slot.eventDayId, template: { code: slot.block } },
    select: { id: true },
  });
  return { eventId, membershipId: membership?.id ?? null, shiftId: shift?.id ?? null };
}

export async function listAssignmentsForStation(
  scope: EventScope,
  query: { stationId: string; eventDayId?: string | undefined },
): Promise<AssignmentWithNames[]> {
  return prisma.shiftAssignment.findMany({
    where: {
      eventId: scope.eventId,
      stationId: query.stationId,
      ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
    },
    include: assignmentInclude,
    orderBy: [{ eventDay: { date: 'asc' } }, { block: 'asc' }, { roleLabel: 'asc' }],
  });
}

/** Whether the volunteer and station exist and are active, and the day exists, in this event. */
export async function findAssignmentTargets(
  scope: EventScope,
  ids: { volunteerId: string; stationId: string; eventDayId: string },
) {
  const { eventId } = scope;
  const [membership, station, eventDay] = await Promise.all([
    prisma.eventMembership.findUnique({
      where: { eventId_personId: { eventId, personId: ids.volunteerId } },
      select: { status: true },
    }),
    prisma.station.findFirst({ where: { eventId, id: ids.stationId }, select: { active: true } }),
    prisma.eventDay.findFirst({ where: { eventId, id: ids.eventDayId }, select: { id: true } }),
  ]);
  const volunteer = membership ? { active: membership.status === 'ACTIVE' } : null;
  return { volunteer, station, eventDay };
}

/** Whether this person is rostered at this station on any day of the event. */
export async function isRosteredAt(
  scope: EventScope,
  who: { membershipId: string; stationId: string },
): Promise<boolean> {
  const row = await prisma.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, ...who },
    select: { id: true },
  });
  return row !== null;
}

export async function stationExists(scope: EventScope, stationId: string): Promise<boolean> {
  const station = await prisma.station.findFirst({
    where: { eventId: scope.eventId, id: stationId },
    select: { id: true },
  });
  return station !== null;
}

/** The assignment already in this person's (day, block) slot, if any. */
export async function findAssignmentInSlot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  slot: { volunteerId: string; eventDayId: string; block: Block },
) {
  return tx.shiftAssignment.findUnique({
    where: { volunteerId_eventDayId_block: slot, eventId: scope.eventId },
    select: { stationId: true, roleLabel: true },
  });
}

export async function upsertAssignmentRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.ShiftAssignmentUncheckedCreateInput, 'eventId'> & { block: Block },
): Promise<{ id: string }> {
  const links = await assignmentLinks(tx, scope, data);
  return tx.shiftAssignment.upsert({
    where: {
      volunteerId_eventDayId_block: {
        volunteerId: data.volunteerId,
        eventDayId: data.eventDayId,
        block: data.block,
      },
      eventId: scope.eventId,
    },
    create: { ...data, ...links },
    update: { stationId: data.stationId, roleLabel: data.roleLabel, ...links },
    select: { id: true },
  });
}

export async function findAssignmentWithNames(
  scope: EventScope,
  id: string,
): Promise<AssignmentWithNames | null> {
  return prisma.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, id },
    include: assignmentInclude,
  });
}

export async function findAssignmentForRemoval(scope: EventScope, id: string) {
  return prisma.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, id },
    select: { id: true, volunteerId: true, stationId: true, block: true, checkedInAt: true },
  });
}

export async function deleteAssignmentRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<void> {
  await tx.shiftAssignment.delete({ where: { id, eventId: scope.eventId } });
}
