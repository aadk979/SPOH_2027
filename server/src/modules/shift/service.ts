import {
  ERROR_CODES,
  type BriefingSlotRecord,
  type CompleteBriefingSlotRequest,
  type CreateSwapRequest,
  type DecideSwapRequest,
  type ListBriefingSlotsQuery,
  type LongShiftWarning,
  type StaffingGap,
  type StaffingGapsResponse,
  type SwapRequestRecord,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { AppError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_SETTINGS, getSettings } from '../../lib/settings.js';
import {
  activeShiftBlocks,
  eventDayAnchor,
  minutesBetween,
  singaporeDateString,
} from '../../lib/time.js';
import {
  applySwap,
  completeSlot,
  createSwap,
  findSlotById,
  findSwapById,
  hasAssignmentInBlock,
  listBriefingSlots,
  listSwaps,
  longRunningShifts,
  rejectSwap,
  staffingByStation,
  toBriefingSlotRecord,
  toSwapRecord,
} from './repo.js';

/** Swaps, briefing waves and staffing gaps (PRODUCT_BRIEF §6). */

/**
 * Time on station without a break before the welfare list picks somebody up.
 *
 * Three hours is the threshold from slide 39, and it is the shipped default;
 * the live value is a runtime setting, because how long is too long depends on
 * the room and the day and is exactly the sort of thing a dry run tells you.
 */
export const LONG_SHIFT_MINUTES = DEFAULT_SETTINGS.longShiftMinutes;

export async function requestSwap(
  request: CreateSwapRequest,
  requesterId: string,
  audit: AuditContext,
): Promise<SwapRequestRecord> {
  const swap = await prisma.$transaction(async (tx) => {
    const assignment = await tx.shiftAssignment.findUnique({
      where: { id: request.assignmentId },
      select: { id: true, volunteerId: true, eventDayId: true, block: true },
    });

    if (!assignment) throw new NotFoundError('Shift assignment');

    // You may only give away your own shift. Otherwise anyone could reassign
    // anyone (IDOR — BUILD_PLAN §8.5).
    if (assignment.volunteerId !== requesterId) {
      throw new ForbiddenError('You can only request a swap for your own shift');
    }

    if (request.targetVolunteerId === requesterId) {
      throw new AppError(409, ERROR_CODES.CONFLICT, 'You cannot swap a shift with yourself');
    }

    const target = await tx.volunteer.findUnique({
      where: { id: request.targetVolunteerId },
      select: { id: true, active: true },
    });
    if (!target?.active) throw new NotFoundError('Volunteer');

    // Caught here rather than at approval so the requester finds out now,
    // while there is still time to ask somebody else.
    if (
      await hasAssignmentInBlock(tx, {
        volunteerId: target.id,
        eventDayId: assignment.eventDayId,
        block: assignment.block,
      })
    ) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        'That volunteer is already working this block. Ask someone else.',
      );
    }

    const row = await createSwap(tx, {
      assignmentId: assignment.id,
      requesterId,
      targetId: target.id,
      reason: request.reason ?? null,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'swap.decide',
      entityType: 'ShiftSwapRequest',
      entityId: row.id,
      after: { status: 'REQUESTED', assignmentId: assignment.id, targetId: target.id },
    });

    return row;
  });

  return toSwapRecord(swap);
}

/**
 * IC approval. Approving moves the assignment and clears the check-in state —
 * the new person has not arrived yet, and inheriting someone else's check-in
 * would make the attendance view lie.
 */
export async function decideSwap(
  swapId: string,
  request: DecideSwapRequest,
  deciderId: string,
  audit: AuditContext,
): Promise<SwapRequestRecord> {
  await prisma.$transaction(async (tx) => {
    const swap = await findSwapById(swapId, tx);
    if (!swap) throw new NotFoundError('Swap request');

    if (swap.status !== 'REQUESTED') {
      throw new AppError(
        409,
        ERROR_CODES.SWAP_NOT_PENDING,
        `This swap has already been ${swap.status.toLowerCase()}`,
      );
    }

    if (request.decision === 'REJECTED') {
      await rejectSwap(tx, swapId, deciderId);
    } else {
      // Re-checked at approval: the target may have picked up another shift in
      // the time between the request and the decision.
      if (
        await hasAssignmentInBlock(tx, {
          volunteerId: swap.targetId,
          eventDayId: swap.assignment.eventDayId,
          block: swap.assignment.block,
        })
      ) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          'That volunteer has since been assigned to this block. The swap cannot be approved.',
        );
      }

      await applySwap(tx, {
        swapId,
        assignmentId: swap.assignmentId,
        targetId: swap.targetId,
        decidedById: deciderId,
      });
    }

    await writeAudit(tx, {
      ...audit,
      action: 'swap.decide',
      entityType: 'ShiftSwapRequest',
      entityId: swapId,
      before: { status: swap.status },
      after: { status: request.decision, note: request.note ?? null },
    });
  });

  const refreshed = await findSwapById(swapId);
  if (!refreshed) throw new NotFoundError('Swap request');

  return toSwapRecord(refreshed);
}

export async function listMySwaps(volunteerId: string): Promise<SwapRequestRecord[]> {
  return (await listSwaps({ volunteerId })).map(toSwapRecord);
}

export async function listPendingSwaps(): Promise<SwapRequestRecord[]> {
  return (await listSwaps({ status: 'REQUESTED' })).map(toSwapRecord);
}

export async function getBriefingSlots(
  query: ListBriefingSlotsQuery,
  viewerId: string,
): Promise<BriefingSlotRecord[]> {
  const slots = await listBriefingSlots({
    ...(query.eventDayId ? { eventDayId: query.eventDayId } : {}),
    // Defaults to today, because the briefing roster is a today-shaped thing.
    date: eventDayAnchor(query.date ?? singaporeDateString()),
  });

  const now = new Date();
  return slots.map((slot) => toBriefingSlotRecord(slot, { viewerId, now }));
}

export async function markSlotComplete(
  slotId: string,
  request: CompleteBriefingSlotRequest,
  actorId: string,
  audit: AuditContext,
): Promise<BriefingSlotRecord> {
  const slot = await findSlotById(slotId);
  if (!slot) throw new NotFoundError('Briefing slot');

  if (slot.completedAt) {
    throw new AppError(
      409,
      ERROR_CODES.SLOT_ALREADY_COMPLETED,
      'That briefing slot is already marked complete',
    );
  }

  // The briefer marks their own slot done. An IC can too — someone has to be
  // able to tidy up after a briefer whose phone died mid-wave.
  if (slot.briefierId && slot.briefierId !== actorId) {
    throw new ForbiddenError('Only the assigned briefer or an IC can complete this slot');
  }

  await prisma.$transaction(async (tx) => {
    await completeSlot(tx, slotId, request.notes ?? null);

    await writeAudit(tx, {
      ...audit,
      action: 'roster.edit',
      entityType: 'BriefingSlot',
      entityId: slotId,
      after: { completed: true },
    });
  });

  const refreshed = await findSlotById(slotId);
  if (!refreshed) throw new NotFoundError('Briefing slot');

  return toBriefingSlotRecord(refreshed, { viewerId: actorId, now: new Date() });
}

/**
 * Which stations are understaffed right now.
 *
 * Reports three distinct problems, because they need three different responses:
 * nobody rostered at all, everyone rostered but nobody arrived, and some but
 * not all of the team present.
 */
export async function getStaffingGaps(now = new Date()): Promise<StaffingGapsResponse> {
  const blocks = activeShiftBlocks(now);
  const today = eventDayAnchor(singaporeDateString(now));

  const eventDay = await prisma.eventDay.findUnique({
    where: { date: today },
    select: { id: true },
  });

  if (!eventDay || blocks.length === 0) {
    // Outside event hours nothing is understaffed, because nothing is staffed.
    return { asOf: now.toISOString(), activeBlocks: blocks, gaps: [] };
  }

  const [staffing, activeStations] = await Promise.all([
    staffingByStation({ eventDayId: eventDay.id, blocks }),
    prisma.station.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);

  const gaps: StaffingGap[] = [];

  for (const block of blocks) {
    for (const station of activeStations) {
      const row = staffing.find((s) => s.stationId === station.id && s.block === block);
      const assigned = row?.assigned ?? 0;
      const checkedIn = row?.checkedIn ?? 0;

      if (assigned > 0 && checkedIn === assigned) continue;

      gaps.push({
        stationId: station.id,
        stationName: station.name,
        block,
        assigned,
        checkedIn,
        missing: Math.max(0, assigned - checkedIn),
        severity: assigned === 0 ? 'UNSTAFFED' : checkedIn === 0 ? 'NOBODY_CHECKED_IN' : 'PARTIAL',
      });
    }
  }

  return { asOf: now.toISOString(), activeBlocks: blocks, gaps };
}

export async function getLongShifts(now = new Date()): Promise<LongShiftWarning[]> {
  const cutoff = new Date(now.getTime() - getSettings().longShiftMinutes * 60_000);
  const rows = await longRunningShifts(cutoff);

  /**
   * One warning per person, not per assignment.
   *
   * The morning and afternoon blocks overlap and nothing auto-checks-out, so a
   * volunteer who works through the handover has two open assignments and would
   * otherwise appear on the welfare list twice. The earliest check-in is the
   * one that matters — it is how long they have actually been standing there.
   */
  const byVolunteer = new Map<string, LongShiftWarning>();

  for (const row of rows) {
    if (row.checkedInAt === null) continue;

    const warning: LongShiftWarning = {
      volunteerId: row.volunteerId,
      volunteerName: row.volunteer.displayName,
      stationName: row.station.name,
      checkedInAt: row.checkedInAt.toISOString(),
      minutesOnStation: minutesBetween(row.checkedInAt, now),
    };

    const existing = byVolunteer.get(row.volunteerId);
    if (!existing || warning.minutesOnStation > existing.minutesOnStation) {
      byVolunteer.set(row.volunteerId, warning);
    }
  }

  return [...byVolunteer.values()].sort((a, b) => b.minutesOnStation - a.minutesOnStation);
}
