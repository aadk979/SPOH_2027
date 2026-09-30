/**
 * Time handling (engineering-standards §7, ADR-007 §7).
 *
 * Everything is stored and transported as UTC instants. Wall-clock questions —
 * which event day is "today", which local hour a record falls in — are always
 * answered in the event's own IANA timezone through `eventClock.ts`, which sits
 * on the shared DST rules in `@spoh/shared` (`wallTimeToInstant`,
 * `zonedDayWindow`). There is no fixed offset anywhere: a London event on its
 * 23-hour spring day gets a 23-hour "today".
 *
 * Which shift is running is not answered here at all: `Shift` rows carry real
 * instants (ADR-002), and `platform/event/runningShifts` filters on them.
 */
export { fixedClock, systemClock, type Clock } from './clock.js';
export {
  eventDateOf,
  eventDayAnchorOf,
  eventDayStart,
  localHourLabel,
  localTimestamp,
  type EventZone,
} from './eventClock.js';

/**
 * The instant Postgres stores for a `@db.Date` column holding `dateString`:
 * Prisma reads and writes `Date` columns at UTC midnight, so comparisons with
 * an event day's `date` must use the same anchor. It names a calendar date,
 * not a moment; the event's zone says when that date happens.
 */
export function eventDayAnchor(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

export const BUCKET_MINUTES: Readonly<Record<'15m' | '30m' | '1h', number>> = Object.freeze({
  '15m': 15,
  '30m': 30,
  '1h': 60,
});

/** Whole minutes between two instants, floored, never negative. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}
