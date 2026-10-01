import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { SHIFT_REF_SELECT } from '../../../platform/db/shiftRef.js';

/**
 * Data access for shift assignments: who is rostered where, on which shift.
 * The unique key is (volunteer, shift): one person cannot be in two places on
 * the same shift. Every query names its event (ADR-001 §2).
 */

export const assignmentInclude = {
  volunteer: { select: { displayName: true, phone: true } },
  station: { select: { name: true } },
  eventDay: { select: { date: true } },
  shift: { select: SHIFT_REF_SELECT },
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithNames = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

/**
 * What an assignment row points at besides the person: the event and the
 * person's membership of it. Every writer of assignments goes through this.
 */
export async function assignmentLinks(
  tx: PrismaTransactionClient,
  scope: EventScope,
  volunteerId: string,
): Promise<{ eventId: string; membershipId: string | null }> {
  const { eventId } = scope;
  const membership = await tx.eventMembership.findUnique({
    where: { eventId_personId: { eventId, personId: volunteerId } },
    select: { id: true },
  });
  return { eventId, membershipId: membership?.id ?? null };
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
    orderBy: [{ shift: { startsAt: 'asc' } }, { roleLabel: 'asc' }],
  });
}

/** Whether the volunteer and station exist and are active, and the shift exists, in this event. */
export async function findAssignmentTargets(
  scope: EventScope,
  ids: { volunteerId: string; stationId: string; shiftId: string },
) {
  const { eventId } = scope;
  const [membership, station, shift] = await Promise.all([
    prisma.eventMembership.findUnique({
      where: { eventId_personId: { eventId, personId: ids.volunteerId } },
      select: { status: true },
    }),
    prisma.station.findFirst({ where: { eventId, id: ids.stationId }, select: { active: true } }),
    prisma.shift.findFirst({ where: { eventId, id: ids.shiftId }, select: { eventDayId: true } }),
  ]);
  const volunteer = membership ? { active: membership.status === 'ACTIVE' } : null;
  return { volunteer, station, shift };
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

/** The assignment already in this person's shift, if any. */
export async function findAssignmentInSlot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  slot: { volunteerId: string; shiftId: string },
) {
  return tx.shiftAssignment.findUnique({
    where: { volunteerId_shiftId: slot, eventId: scope.eventId },
    select: { stationId: true, roleLabel: true },
  });
}

export async function upsertAssignmentRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.ShiftAssignmentUncheckedCreateInput, 'eventId'>,
): Promise<{ id: string }> {
  const links = await assignmentLinks(tx, scope, data.volunteerId);
  return tx.shiftAssignment.upsert({
    where: {
      volunteerId_shiftId: { volunteerId: data.volunteerId, shiftId: data.shiftId },
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
    select: { id: true, volunteerId: true, stationId: true, shiftId: true, checkedInAt: true },
  });
}

export async function deleteAssignmentRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<void> {
  await tx.shiftAssignment.delete({ where: { id, eventId: scope.eventId } });
}
