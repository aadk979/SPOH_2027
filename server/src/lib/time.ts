/**
 * Time handling (BUILD_PLAN §3.3).
 *
 * Everything is stored and transported as UTC. `Asia/Singapore` exists here
 * only to answer two operational questions the database cannot: which event day
 * is "today", and which shift block is running right now. Singapore is UTC+8
 * year round with no daylight saving, which is why the offset arithmetic below
 * is safe.
 */
import type { ShiftBlock } from '@spoh/shared';

export const EVENT_TIME_ZONE = 'Asia/Singapore';

/** UTC+8, fixed. Singapore has observed no daylight saving since 1935. */
const SGT_OFFSET_MINUTES = 8 * 60;

/**
 * Shift blocks from BUILD_PLAN §1.1, in local wall-clock minutes from midnight.
 * The blocks overlap between 13:30 and 14:00 — that handover is intentional and
 * means a moment can legitimately belong to both.
 */
export const SHIFT_BLOCKS: Readonly<
  Record<ShiftBlock, { startMinute: number; endMinute: number }>
> = Object.freeze({
  MORNING: { startMinute: 9 * 60 + 30, endMinute: 14 * 60 },
  AFTERNOON: { startMinute: 13 * 60 + 30, endMinute: 18 * 60 },
});

/** The calendar date in Singapore for an instant, as `YYYY-MM-DD`. */
export function singaporeDateString(instant: Date = new Date()): string {
  const shifted = new Date(instant.getTime() + SGT_OFFSET_MINUTES * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Midnight Singapore time for a date, expressed as the UTC instant Postgres
 * stores in a `@db.Date` column. Prisma reads and writes `Date` columns at UTC
 * midnight, so comparisons must use the same anchor.
 */
export function eventDayAnchor(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

/** Minutes since local midnight in Singapore. */
export function singaporeMinuteOfDay(instant: Date = new Date()): number {
  const shifted = new Date(instant.getTime() + SGT_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * Which shift blocks contain this instant. Returns both during the 13:30–14:00
 * handover, and an empty array outside event hours — station scoping treats
 * "outside any block" as "not on shift".
 */
export function activeShiftBlocks(instant: Date = new Date()): ShiftBlock[] {
  const minute = singaporeMinuteOfDay(instant);
  return (Object.keys(SHIFT_BLOCKS) as ShiftBlock[]).filter((block) => {
    const { startMinute, endMinute } = SHIFT_BLOCKS[block];
    return minute >= startMinute && minute < endMinute;
  });
}

/** Truncate an instant down to a bucket boundary, for footfall curves. */
export function floorToBucket(instant: Date, bucketMinutes: number): Date {
  const ms = bucketMinutes * 60_000;
  return new Date(Math.floor(instant.getTime() / ms) * ms);
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
