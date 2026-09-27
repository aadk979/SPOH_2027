import type { BriefingSlotRecord, SwapRequestRecord } from '@spoh/shared';
import { minutesBetween } from '../../../platform/time/index.js';
import type { SlotWithContext, SwapWithContext } from './repo.js';

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
