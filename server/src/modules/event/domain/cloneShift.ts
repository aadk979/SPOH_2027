import { wallTimeToInstant, zonedWallTime } from '@spoh/shared';

/**
 * Dates and times moved by a clone's day offset (ADR-001 §6), on the event's
 * wall clock: a 09:30 shift stays a 09:30 shift on its new date, whatever DST
 * does in between, by the rules of `wallTimeToInstant`.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" moved by whole days. */
export function shiftDate(date: string, days: number): string {
  const d = DATE.exec(date);
  if (!d) throw new RangeError(`not a date: ${date}`);
  return new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + days))
    .toISOString()
    .slice(0, 10);
}

/** A `@db.Date` anchor (UTC midnight of a calendar date) moved by whole days. */
export function shiftDayAnchor(anchor: Date, days: number): Date {
  return new Date(`${shiftDate(anchor.toISOString().slice(0, 10), days)}T00:00:00.000Z`);
}

/** An instant read on `timezone`'s wall clock, the same wall time `days` later. */
export function shiftWallInstant(instant: Date, days: number, timezone: string): Date {
  const wall = zonedWallTime(instant, timezone);
  return wallTimeToInstant(shiftDate(wall.slice(0, 10), days), wall.slice(11, 16), timezone);
}
