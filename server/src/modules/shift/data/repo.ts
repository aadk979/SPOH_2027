import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';
import { SHIFT_REF_SELECT, toShiftRef, type ShiftRefRow } from '../../../platform/db/shiftRef.js';

/**
 * Data access for swaps, briefing waves and staffing (PRODUCT_BRIEF §6). Every
 * query names its event (ADR-001 §2).
 */

const swapInclude = {
  assignment: {
    include: {
      station: { select: { name: true } },
      eventDay: { select: { date: true } },
      shift: { select: SHIFT_REF_SELECT },
    },
  },
  requester: { select: { displayName: true } },
  target: { select: { displayName: true } },
} satisfies Prisma.ShiftSwapRequestInclude;

export type SwapWithContext = Prisma.ShiftSwapRequestGetPayload<{ include: typeof swapInclude }>;

export async function createSwap(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: { assignmentId: string; requesterId: string; targetId: string; reason: string | null },
): Promise<{ id: string }> {
  // Sequential: parallel queries overlap on a transaction's connection (F03-019).
  const requesterMembershipId = await membershipIdOf(tx, scope, data.requesterId);
  const targetMembershipId = await membershipIdOf(tx, scope, data.targetId);
  return tx.shiftSwapRequest.create({
    data: { ...data, eventId: scope.eventId, requesterMembershipId, targetMembershipId },
    select: { id: true },
  });
}

/**
 * A swap as a decision needs it, inside the transaction. One relation, so one
 * follow-up query: an `include` of several relations loads them in parallel,
 * which on a transaction's single connection overlaps queries (F03-019).
 */
export async function findSwapForDecision(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) {
  return tx.shiftSwapRequest.findUnique({
    where: { id, eventId: scope.eventId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      targetId: true,
      assignmentId: true,
      assignment: { select: { volunteerId: true, shiftId: true } },
    },
  });
}

export type SwapForDecision = NonNullable<Awaited<ReturnType<typeof findSwapForDecision>>>;

export async function findSwapById(
  scope: EventScope,
  id: string,
  tx: PrismaTransactionClient = prisma,
): Promise<SwapWithContext | null> {
  return tx.shiftSwapRequest.findUnique({
    where: { id, eventId: scope.eventId },
    include: swapInclude,
  });
}

export async function listSwaps(
  scope: EventScope,
  filter: { status?: Prisma.ShiftSwapRequestWhereInput['status']; volunteerId?: string },
): Promise<SwapWithContext[]> {
  return prisma.shiftSwapRequest.findMany({
    where: {
      eventId: scope.eventId,
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
  scope: EventScope,
  decision: { swapId: string; status: 'APPROVED' | 'REJECTED'; decidedById: string },
): Promise<boolean> {
  const { count } = await tx.shiftSwapRequest.updateMany({
    where: { eventId: scope.eventId, id: decision.swapId, status: 'REQUESTED' },
    data: {
      status: decision.status,
      decidedById: decision.decidedById,
      decidedByMembershipId: await membershipIdOf(tx, scope, decision.decidedById),
      decidedAt: new Date(),
    },
  });
  return count === 1;
}

/**
 * Move the assignment to the target volunteer, with the target's membership.
 * The unique key (volunteer, shift) means a target already on that shift
 * would collide — the use case checks for that before it gets here.
 */
export async function moveAssignment(
  tx: PrismaTransactionClient,
  scope: EventScope,
  move: { assignmentId: string; targetId: string },
): Promise<void> {
  await tx.shiftAssignment.update({
    where: { id: move.assignmentId, eventId: scope.eventId },
    data: {
      volunteerId: move.targetId,
      membershipId: await membershipIdOf(tx, scope, move.targetId),
      checkedInAt: null,
      checkedOutAt: null,
    },
  });
}

/** Is this volunteer already working that shift? */
export async function hasAssignmentOnShift(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { volunteerId: string; shiftId: string },
): Promise<boolean> {
  const existing = await tx.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, ...input },
    select: { id: true },
  });
  return existing !== null;
}

const slotInclude = {
  eventDay: { select: { date: true } },
  briefier: { select: { displayName: true } },
} satisfies Prisma.BriefingSlotInclude;

export type SlotWithContext = Prisma.BriefingSlotGetPayload<{ include: typeof slotInclude }>;

export async function listBriefingSlots(
  scope: EventScope,
  filter: { eventDayId?: string; date?: Date },
): Promise<SlotWithContext[]> {
  return prisma.briefingSlot.findMany({
    where: {
      eventId: scope.eventId,
      ...(filter.eventDayId ? { eventDayId: filter.eventDayId } : {}),
      ...(filter.date ? { eventDay: { date: filter.date } } : {}),
    },
    include: slotInclude,
    orderBy: { startsAt: 'asc' },
  });
}

export async function findSlotById(scope: EventScope, id: string): Promise<SlotWithContext | null> {
  return prisma.briefingSlot.findFirst({
    where: { eventId: scope.eventId, id },
    include: slotInclude,
  });
}

export async function completeSlot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; notes: string | null },
): Promise<void> {
  await tx.briefingSlot.update({
    where: { id: change.id, eventId: scope.eventId },
    data: { completedAt: new Date(), ...(change.notes ? { notes: change.notes } : {}) },
  });
}

/** The shifts running now, one per template, named and timed. */
export async function runningShiftRefs(scope: EventScope, running: Prisma.ShiftWhereInput) {
  const shifts = await prisma.shift.findMany({
    where: { eventId: scope.eventId, ...running },
    select: SHIFT_REF_SELECT,
    orderBy: { startsAt: 'asc' },
  });
  const byCode = new Map<string, ShiftRefRow>();
  for (const shift of shifts) {
    if (!byCode.has(shift.template.code)) byCode.set(shift.template.code, shift);
  }
  return [...byCode.values()].map(toShiftRef);
}

/**
 * Staffing per station for the shifts running now: how many are rostered, and
 * how many have actually checked in. The gap between those two numbers is the
 * no-show list.
 */
export async function staffingByStation(
  scope: EventScope,
  running: Prisma.ShiftWhereInput,
): Promise<
  Array<{
    stationId: string;
    stationName: string;
    shiftCode: string;
    assigned: number;
    checkedIn: number;
  }>
> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: { eventId: scope.eventId, shift: running },
    select: {
      stationId: true,
      checkedInAt: true,
      checkedOutAt: true,
      station: { select: { name: true } },
      shift: { select: { template: { select: { code: true } } } },
    },
  });

  const byKey = new Map<
    string,
    {
      stationId: string;
      stationName: string;
      shiftCode: string;
      assigned: number;
      checkedIn: number;
    }
  >();

  for (const assignment of assignments) {
    const shiftCode = assignment.shift.template.code;
    const key = `${assignment.stationId}:${shiftCode}`;
    const entry = byKey.get(key) ?? {
      stationId: assignment.stationId,
      stationName: assignment.station.name,
      shiftCode,
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
 *
 * Open shifts checked in before `cutoff`, today only: a shift from an earlier
 * day that nobody checked out of is a record to tidy, not someone still
 * standing at a station (F03-023).
 */
export async function longRunningShifts(scope: EventScope, window: { cutoff: Date; since: Date }) {
  return prisma.shiftAssignment.findMany({
    where: {
      eventId: scope.eventId,
      checkedInAt: { lt: window.cutoff, gte: window.since },
      checkedOutAt: null,
    },
    select: {
      volunteerId: true,
      checkedInAt: true,
      volunteer: { select: { displayName: true } },
      station: { select: { name: true } },
    },
  });
}

/** The assignment a swap would give away. */
export async function findAssignmentForSwap(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) {
  return tx.shiftAssignment.findUnique({
    where: { id, eventId: scope.eventId },
    select: { id: true, volunteerId: true, shiftId: true },
  });
}

/** A person as a swap target: active in this event. */
export async function findVolunteerActive(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) {
  const membership = await tx.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId: id } },
    select: { status: true },
  });
  return membership ? { id, active: membership.status === 'ACTIVE' } : null;
}

/** Active stations in their display order, for the staffing grid. */
export async function listStaffedStations(scope: EventScope) {
  return prisma.station.findMany({
    where: { eventId: scope.eventId, active: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  });
}
