import type { BriefingSlotRecord, SwapRequestRecord } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { minutesBetween } from '../../platform/time/index.js';
import { prisma, type PrismaTransactionClient } from '../../platform/db/client.js';

/** Data access for swaps, briefing waves and staffing (PRODUCT_BRIEF §6). */

const swapInclude = {
  assignment: {
    include: { station: { select: { name: true } }, eventDay: { select: { date: true } } },
  },
  requester: { select: { displayName: true } },
  target: { select: { displayName: true } },
} satisfies Prisma.ShiftSwapRequestInclude;

export type SwapWithContext = Prisma.ShiftSwapRequestGetPayload<{ include: typeof swapInclude }>;

export function toSwapRecord(swap: SwapWithContext): SwapRequestRecord {
  return {
    id: swap.id,
    assignmentId: swap.assignmentId,
    stationName: swap.assignment.station.name,
    date: swap.assignment.eventDay.date.toISOString().slice(0, 10),
    block: swap.assignment.block,
    requesterId: swap.requesterId,
    requesterName: swap.requester.displayName,
    targetId: swap.targetId,
    targetName: swap.target.displayName,
    status: swap.status,
    reason: swap.reason,
    decidedById: swap.decidedById,
    decidedAt: swap.decidedAt?.toISOString() ?? null,
    createdAt: swap.createdAt.toISOString(),
  };
}

export async function createSwap(
  tx: PrismaTransactionClient,
  data: Prisma.ShiftSwapRequestUncheckedCreateInput,
): Promise<SwapWithContext> {
  return tx.shiftSwapRequest.create({ data, include: swapInclude });
}

export async function findSwapById(
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<SwapWithContext | null> {
  return tx.shiftSwapRequest.findUnique({ where: { id }, include: swapInclude });
}

export async function listSwaps(filter: {
  status?: Prisma.ShiftSwapRequestWhereInput['status'];
  volunteerId?: string;
}): Promise<SwapWithContext[]> {
  return prisma.shiftSwapRequest.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.volunteerId
        ? { OR: [{ requesterId: filter.volunteerId }, { targetId: filter.volunteerId }] }
        : {}),
    },
    include: swapInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function applySwap(
  tx: PrismaTransactionClient,
  input: { swapId: string; assignmentId: string; targetId: string; decidedById: string },
): Promise<void> {
  // The assignment moves to the target volunteer. The unique key
  // (volunteer, day, block) means a target already working that block would
  // collide — the service checks for that before we get here.
  await tx.shiftAssignment.update({
    where: { id: input.assignmentId },
    data: { volunteerId: input.targetId, checkedInAt: null, checkedOutAt: null },
  });

  await tx.shiftSwapRequest.update({
    where: { id: input.swapId },
    data: { status: 'APPROVED', decidedById: input.decidedById, decidedAt: new Date() },
  });
}

export async function rejectSwap(
  tx: PrismaTransactionClient,
  swapId: string,
  decidedById: string,
): Promise<void> {
  await tx.shiftSwapRequest.update({
    where: { id: swapId },
    data: { status: 'REJECTED', decidedById, decidedAt: new Date() },
  });
}

/** Is this volunteer already working that day and block? */
export async function hasAssignmentInBlock(
  tx: PrismaTransactionClient,
  input: {
    volunteerId: string;
    eventDayId: string;
    block: Prisma.ShiftAssignmentWhereInput['block'];
  },
): Promise<boolean> {
  const existing = await tx.shiftAssignment.findFirst({
    where: input as Prisma.ShiftAssignmentWhereInput,
    select: { id: true },
  });
  return existing !== null;
}

const slotInclude = {
  eventDay: { select: { date: true } },
  briefier: { select: { displayName: true } },
} satisfies Prisma.BriefingSlotInclude;

export type SlotWithContext = Prisma.BriefingSlotGetPayload<{ include: typeof slotInclude }>;

export function toBriefingSlotRecord(
  slot: SlotWithContext,
  context: { viewerId: string; now: Date },
): BriefingSlotRecord {
  return {
    id: slot.id,
    eventDayId: slot.eventDayId,
    date: slot.eventDay.date.toISOString().slice(0, 10),
    startsAt: slot.startsAt.toISOString(),
    briefierId: slot.briefierId,
    briefierName: slot.briefier?.displayName ?? null,
    waveSize: slot.waveSize,
    completedAt: slot.completedAt?.toISOString() ?? null,
    notes: slot.notes,
    isMine: slot.briefierId === context.viewerId,
    // Negative once the slot has started, which is what lets the client show
    // "you're up next" and "you're on now" as different states.
    minutesUntilStart:
      slot.startsAt > context.now
        ? minutesBetween(context.now, slot.startsAt)
        : -minutesBetween(slot.startsAt, context.now),
  };
}

export async function listBriefingSlots(filter: {
  eventDayId?: string;
  date?: Date;
}): Promise<SlotWithContext[]> {
  return prisma.briefingSlot.findMany({
    where: {
      ...(filter.eventDayId ? { eventDayId: filter.eventDayId } : {}),
      ...(filter.date ? { eventDay: { date: filter.date } } : {}),
    },
    include: slotInclude,
    orderBy: { startsAt: 'asc' },
  });
}

export async function findSlotById(id: string): Promise<SlotWithContext | null> {
  return prisma.briefingSlot.findUnique({ where: { id }, include: slotInclude });
}

export async function completeSlot(
  tx: PrismaTransactionClient,
  id: string,
  notes: string | null,
): Promise<void> {
  await tx.briefingSlot.update({
    where: { id },
    data: { completedAt: new Date(), ...(notes ? { notes } : {}) },
  });
}

/**
 * Staffing per station for the blocks running now: how many are rostered, and
 * how many have actually checked in. The gap between those two numbers is the
 * no-show list.
 */
export async function staffingByStation(input: {
  eventDayId: string;
  blocks: Array<Prisma.ShiftAssignmentWhereInput['block']>;
}): Promise<
  Array<{
    stationId: string;
    stationName: string;
    block: NonNullable<Prisma.ShiftAssignmentWhereInput['block']>;
    assigned: number;
    checkedIn: number;
  }>
> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      eventDayId: input.eventDayId,
      block: { in: input.blocks as never[] },
    },
    select: {
      stationId: true,
      block: true,
      checkedInAt: true,
      checkedOutAt: true,
      station: { select: { name: true } },
    },
  });

  const byKey = new Map<
    string,
    { stationId: string; stationName: string; block: never; assigned: number; checkedIn: number }
  >();

  for (const assignment of assignments) {
    const key = `${assignment.stationId}:${assignment.block}`;
    const entry = byKey.get(key) ?? {
      stationId: assignment.stationId,
      stationName: assignment.station.name,
      block: assignment.block as never,
      assigned: 0,
      checkedIn: 0,
    };

    entry.assigned += 1;
    // Checked out counts as not on station: they have gone.
    if (assignment.checkedInAt && !assignment.checkedOutAt) entry.checkedIn += 1;

    byKey.set(key, entry);
  }

  return [...byKey.values()];
}

/**
 * Anyone checked in for three hours or more without checking out — the welfare
 * signal from slide 39. A break nobody records is a break nobody can be
 * reminded to take.
 */
export async function longRunningShifts(cutoff: Date) {
  return prisma.shiftAssignment.findMany({
    where: { checkedInAt: { lt: cutoff, not: null }, checkedOutAt: null },
    select: {
      volunteerId: true,
      checkedInAt: true,
      volunteer: { select: { displayName: true } },
      station: { select: { name: true } },
    },
  });
}
