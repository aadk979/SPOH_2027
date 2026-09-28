import { ERROR_CODES, type ShiftBlock } from '@spoh/shared';
import { AppError, ForbiddenError } from '../../../platform/errors/index.js';
import {
  activeShiftBlocks,
  eventDayAnchor,
  singaporeDateString,
} from '../../../platform/time/index.js';

/**
 * You may only check yourself in or out. Verified against the row rather than
 * trusting the id in the request — otherwise any volunteer could mark any
 * other volunteer present (IDOR, BUILD_PLAN §8.5).
 */
export function assertOwnShift(assignment: { volunteerId: string }, volunteerId: string): void {
  if (assignment.volunteerId !== volunteerId) {
    throw new ForbiddenError('You can only check in or out of your own shift');
  }
}

export function assertNotCheckedIn(assignment: { checkedInAt: Date | null }): void {
  if (assignment.checkedInAt) {
    throw new AppError(
      409,
      ERROR_CODES.ALREADY_CHECKED_IN,
      'You are already checked in for this shift',
    );
  }
}

export function assertCheckedIn(assignment: { checkedInAt: Date | null }): void {
  if (!assignment.checkedInAt) {
    throw new AppError(
      409,
      ERROR_CODES.NOT_CHECKED_IN,
      'You cannot check out of a shift you never checked into',
    );
  }
}

/** A shift is running when it is on today's event day, in a block open now. */
export function isRunningNow(
  assignment: { eventDay: { date: Date }; block: ShiftBlock },
  now: Date,
): boolean {
  return (
    assignment.eventDay.date.getTime() === eventDayAnchor(singaporeDateString(now)).getTime() &&
    activeShiftBlocks(now).includes(assignment.block)
  );
}
