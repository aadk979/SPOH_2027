import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/**
 * Data access for shift assignments: who is rostered where, on which day, in
 * which block. The unique key is (volunteer, day, block): one person cannot be
 * in two places in the same block.
 */

export const assignmentInclude = {
  volunteer: { select: { displayName: true, phone: true } },
  station: { select: { name: true } },
  eventDay: { select: { date: true } },
} satisfies Prisma.ShiftAssignmentInclude;

export type AssignmentWithNames = Prisma.ShiftAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;

export async function listAssignmentsForStation(
  stationId: string,
  eventDayId?: string,
): Promise<AssignmentWithNames[]> {
  return prisma.shiftAssignment.findMany({
    where: { stationId, ...(eventDayId ? { eventDayId } : {}) },
    include: assignmentInclude,
    orderBy: [{ eventDay: { date: 'asc' } }, { block: 'asc' }, { roleLabel: 'asc' }],
  });
}

/** Whether the volunteer and station exist and are active, and the day exists. */
export async function findAssignmentTargets(ids: {
  volunteerId: string;
  stationId: string;
  eventDayId: string;
}) {
  const [volunteer, station, eventDay] = await Promise.all([
    prisma.volunteer.findUnique({ where: { id: ids.volunteerId }, select: { active: true } }),
    prisma.station.findUnique({ where: { id: ids.stationId }, select: { active: true } }),
    prisma.eventDay.findUnique({ where: { id: ids.eventDayId }, select: { id: true } }),
  ]);
  return { volunteer, station, eventDay };
}

export async function stationExists(stationId: string): Promise<boolean> {
  return (
    (await prisma.station.findUnique({ where: { id: stationId }, select: { id: true } })) !== null
  );
}

/** The assignment already in this person's (day, block) slot, if any. */
export async function findAssignmentInSlot(
  tx: PrismaTransactionClient,
  slot: {
    volunteerId: string;
    eventDayId: string;
    block: Prisma.ShiftAssignmentUncheckedCreateInput['block'];
  },
) {
  return tx.shiftAssignment.findUnique({
    where: { volunteerId_eventDayId_block: slot },
    select: { stationId: true, roleLabel: true },
  });
}

export async function upsertAssignmentRow(
  tx: PrismaTransactionClient,
  data: Prisma.ShiftAssignmentUncheckedCreateInput & {
    block: Prisma.ShiftAssignmentUncheckedCreateInput['block'];
  },
): Promise<AssignmentWithNames> {
  return tx.shiftAssignment.upsert({
    where: {
      volunteerId_eventDayId_block: {
        volunteerId: data.volunteerId,
        eventDayId: data.eventDayId,
        block: data.block,
      },
    },
    create: data,
    update: { stationId: data.stationId, roleLabel: data.roleLabel },
    include: assignmentInclude,
  });
}

export async function findAssignmentForRemoval(id: string) {
  return prisma.shiftAssignment.findUnique({
    where: { id },
    select: { id: true, volunteerId: true, stationId: true, block: true, checkedInAt: true },
  });
}

export async function deleteAssignmentRow(tx: PrismaTransactionClient, id: string): Promise<void> {
  await tx.shiftAssignment.delete({ where: { id } });
}
