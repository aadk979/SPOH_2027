import { tzOffset } from '@date-fns/tz';

/**
 * Wall-clock time in an event's timezone (ADR-007 §7), for server and client
 * alike. The DST rules live here and nowhere else, whatever the library does
 * by default, so a library swap never changes behaviour:
 *
 *  - an ambiguous wall time (the repeated hour when clocks go back) is its
 *    earlier occurrence;
 *  - a skipped wall time (the hour lost when clocks go forward) moves forward
 *    to the first instant that exists, the moment of the transition.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2})$/;

/** Offset from UTC, in minutes, of `tz` at an instant. */
function offsetAt(tz: string, instant: number): number {
  return tzOffset(tz, new Date(instant));
}

/** The instant a wall-clock date and "HH:MM" name in `tz`, by the rules above. */
export function wallTimeToInstant(date: string, time: string, tz: string): Date {
  const d = DATE.exec(date);
  const t = TIME.exec(time);
  if (!d || !t) throw new RangeError(`not a wall time: ${date} ${time}`);
  const local = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));

  // Any transition near this wall time lies within a day of it: the offsets
  // either side are the only candidates.
  const before = offsetAt(tz, local - 24 * HOUR);
  const after = offsetAt(tz, local + 24 * HOUR);
  const valid = [...new Set([before, after])]
    .map((offset) => local - offset * MINUTE)
    .filter((instant) => local - offsetAt(tz, instant) * MINUTE === instant);
  if (valid.length > 0) return new Date(Math.min(...valid));

  // Skipped: the transition is between reading the wall time at the new
  // offset and at the old one. Find its first minute.
  let low = local - after * MINUTE;
  let high = local - before * MINUTE;
  while (high - low > MINUTE) {
    const mid = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
    if (offsetAt(tz, mid) === before) low = mid;
    else high = mid;
  }
  return new Date(high);
}

/** The wall-clock date ("YYYY-MM-DD") of an instant in `tz`. */
export function zonedDate(instant: Date, tz: string): string {
  const shifted = new Date(instant.getTime() + offsetAt(tz, instant.getTime()) * MINUTE);
  return shifted.toISOString().slice(0, 10);
}

/** The next calendar date after "YYYY-MM-DD". */
export function nextDate(date: string): string {
  const d = DATE.exec(date);
  if (!d) throw new RangeError(`not a date: ${date}`);
  return new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + 1))
    .toISOString()
    .slice(0, 10);
}

function minutesToTime(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The instants an event's operational day covers: from `boundaryMinutes` after
 * local midnight on `date` to the same wall time the next day. 23 or 25 hours
 * long on a DST day.
 */
export function zonedDayWindow(
  date: string,
  tz: string,
  boundaryMinutes = 0,
): { start: Date; end: Date } {
  const at = minutesToTime(boundaryMinutes);
  return { start: wallTimeToInstant(date, at, tz), end: wallTimeToInstant(nextDate(date), at, tz) };
}
