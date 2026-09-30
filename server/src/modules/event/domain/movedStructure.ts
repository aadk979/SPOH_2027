import { shiftDayAnchor, shiftWallInstant } from './cloneShift.js';

/**
 * A source event's days and shifts, each with where it lands in the clone:
 * days by whole days, shifts at the same wall-clock times on their new dates
 * (ADR-001 §6).
 */
export function movedDays<T extends { date: Date }>(
  days: readonly T[],
  offsetDays: number,
): Array<T & { newDate: Date }> {
  return days.map((day) => ({ ...day, newDate: shiftDayAnchor(day.date, offsetDays) }));
}

export function movedShifts<T extends { startsAt: Date; endsAt: Date }>(
  shifts: readonly T[],
  move: { offsetDays: number; timezone: string },
): Array<T & { newStartsAt: Date; newEndsAt: Date }> {
  return shifts.map((shift) => ({
    ...shift,
    newStartsAt: shiftWallInstant(shift.startsAt, move.offsetDays, move.timezone),
    newEndsAt: shiftWallInstant(shift.endsAt, move.offsetDays, move.timezone),
  }));
}
