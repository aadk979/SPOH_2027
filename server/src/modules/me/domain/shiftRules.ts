import { ERROR_CODES } from '@spoh/shared';
import { AppError, ConflictError, ForbiddenError } from '../../../platform/errors/index.js';

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

/**
 * One check-out per shift: a second tap later would stretch the hours the
 * report counts (F03-015).
 */
export function assertNotCheckedOut(assignment: { checkedOutAt: Date | null }): void {
  if (assignment.checkedOutAt) throw alreadyCheckedOut();
}

export function alreadyCheckedOut(): ConflictError {
  return new ConflictError(
    ERROR_CODES.ALREADY_CHECKED_OUT,
    'You have already checked out of this shift',
  );
}

/** Check-in follows verified attendance: a state to reach, not a permission (F03-026). */
export function assertPresentToday(present: boolean): void {
  if (!present) {
    throw new ConflictError(
      ERROR_CODES.ATTENDANCE_REQUIRED,
      'Submit verified attendance for today before checking into a current shift.',
    );
  }
}

/**
 * Check-in is open only while the shift runs: "not yet" is a 409, not a 403
 * (F03-026). Whether it runs is the shift's own hours (P09.5), asked of the
 * database.
 */
export function assertRunningNow(running: boolean): void {
  if (!running) {
    throw new ConflictError(
      ERROR_CODES.NOT_ON_SHIFT,
      'This shift is not running now. Check in during its hours.',
    );
  }
}
