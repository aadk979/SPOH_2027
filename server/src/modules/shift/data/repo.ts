import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for swaps, briefing waves and staffing (PRODUCT_BRIEF §6). */

const swapInclude = {
  assignment: {
    include: { station: { select: { name: true } }, eventDay: { select: { date: true } } },
  },
  requester: { select: { displayName: true } },
  target: { select: { displayName: true } },
} satisfies Prisma.ShiftSwapRequestInclude;

export type SwapWithContext = Prisma.ShiftSwapRequestGetPayload<{ include: typeof swapInclude }>;

export async function createSwap(
  tx: PrismaTransactionClient,
  data: Prisma.ShiftSwapRequestUncheckedCreateInput,
): Promise<{ id: string }> {
  return tx.shiftSwapRequest.create({ data, select: { id: true } });
}

/**
 * A swap as a decision needs it, inside the transaction. One relation, so one
 * follow-up query: an `include` of several relations loads them in parallel,
 * which on a transaction's single connection overlaps queries (F03-019).
 */
export async function findSwapForDecision(tx: PrismaTransactionClient, id: string) {
  return tx.shiftSwapRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requesterId: true,
      targetId: true,
      assignmentId: true,
      assignment: { select: { volunteerId: true, eventDayId: true, block: true } },
    },
  });
}

export type SwapForDecision = NonNullable<Awaited<ReturnType<typeof findSwapForDecision>>>;

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

/**
 * Record the decision, conditionally: only a request still REQUESTED is
 * decided. Of two decisions racing on one swap, the second finds nothing to
 * update and is refused, so both can never apply (F03-006).
 */
export async function claimDecision(
  tx: PrismaTransactionClient,
  decision: { swapId: string; status: 'APPROVED' | 'REJECTED'; decidedById: string },
): Promise<boolean> {
  const { count } = await tx.shiftSwapRequest.updateMany({
    where: { id: decision.swapId, status: 'REQUESTED' },
    data: { status: decision.status, decidedById: decision.decidedById, decidedAt: new Date() },
  });
  return count === 1;
}

/**
 * Move the assignment to the target volunteer. The unique key (volunteer, day,
 * block) means a target already working that block would collide — the use
 * case checks for that before it gets here.
 */
export async function moveAssignment(
  tx: PrismaTransactionClient,
  move: { assignmentId: string; targetId: string },
): Promise<void> {
  await tx.shiftAssignment.update({
    where: { id: move.assignmentId },
    data: { volunteerId: move.targetId, checkedInAt: null, checkedOutAt: null },
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
/**
 * Open shifts checked in before `cutoff`, today only: a shift from an earlier
 * day that nobody checked out of is a record to tidy, not someone still
 * standing at a station (F03-023).
 */
export async function longRunningShifts(window: { cutoff: Date; since: Date }) {
  return prisma.shiftAssignment.findMany({
    where: { checkedInAt: { lt: window.cutoff, gte: window.since }, checkedOutAt: null },
    select: {
      volunteerId: true,
      checkedInAt: true,
      volunteer: { select: { displayName: true } },
      station: { select: { name: true } },
    },
  });
}

/** The assignment a swap would give away. */
export async function findAssignmentForSwap(tx: PrismaTransactionClient, id: string) {
  return tx.shiftAssignment.findUnique({
    where: { id },
    select: { id: true, volunteerId: true, eventDayId: true, block: true },
  });
}

export async function findVolunteerActive(tx: PrismaTransactionClient, id: string) {
  return tx.person.findUnique({ where: { id }, select: { id: true, active: true } });
}

export async function findEventDayId(date: Date): Promise<string | null> {
  const day = await prisma.eventDay.findUnique({ where: { date }, select: { id: true } });
  return day?.id ?? null;
}

/** Active stations in their display order, for the staffing grid. */
export async function listStaffedStations() {
  return prisma.station.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
}
