/**
 * Time handling (BUILD_PLAN §3.3).
 *
 * Everything is stored and transported as UTC. `Asia/Singapore` exists here
 * only to answer three operational questions the database cannot: which event
 * day is "today", which shift block is running right now, and which local hour
 * a record falls in when a report groups by hour. Singapore is UTC+8 year round
 * with no daylight saving, which is why the offset arithmetic below is safe.
 *
 * Shift block boundaries are no longer compiled in — they come from runtime
 * settings, because they decide whether the capture screens work at all and
 * moving a rehearsal should not need a deploy. `getSettings()` is synchronous
 * and always populated, so nothing here became async.
 */
import type { ShiftBlock } from '@spoh/shared';
import { env } from '../../config/env.js';
import { getSettings, DEFAULT_SETTINGS } from '../settings/index.js';

export { fixedClock, systemClock, type Clock } from './clock.js';

export const EVENT_TIME_ZONE = 'Asia/Singapore';

/** UTC+8, fixed. Singapore has observed no daylight saving since 1935. */
const SGT_OFFSET_MINUTES = 8 * 60;

/** `HH:MM` in local wall-clock time to minutes since local midnight. */
function toMinuteOfDay(wallClock: string): number {
  const [hours, minutes] = wallClock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * The configured blocks as minute ranges.
 *
 * The blocks may overlap — the 13:30–14:00 handover is intentional and means a
 * moment can legitimately belong to both.
 */
export function shiftBlockRanges(): Record<ShiftBlock, { startMinute: number; endMinute: number }> {
  const configured = getSettings().shiftBlocks;
  const ranges = {} as Record<ShiftBlock, { startMinute: number; endMinute: number }>;

  for (const [block, window] of Object.entries(configured)) {
    ranges[block as ShiftBlock] = {
      startMinute: toMinuteOfDay(window.start),
      endMinute: toMinuteOfDay(window.end),
    };
  }

  return ranges;
}

/**
 * The compiled defaults, as minute ranges.
 *
 * Retained as a named export because it documents the shipped configuration and
 * gives tests a stable reference; live code should call `shiftBlockRanges()` so
 * a changed setting takes effect.
 */
export const SHIFT_BLOCKS: Readonly<
  Record<ShiftBlock, { startMinute: number; endMinute: number }>
> = Object.freeze({
  MORNING: {
    startMinute: toMinuteOfDay(DEFAULT_SETTINGS.shiftBlocks.MORNING.start),
    endMinute: toMinuteOfDay(DEFAULT_SETTINGS.shiftBlocks.MORNING.end),
  },
  AFTERNOON: {
    startMinute: toMinuteOfDay(DEFAULT_SETTINGS.shiftBlocks.AFTERNOON.start),
    endMinute: toMinuteOfDay(DEFAULT_SETTINGS.shiftBlocks.AFTERNOON.end),
  },
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
 * The local hour of an instant, as `YYYY-MM-DDTHH` in Singapore time.
 *
 * Report hour buckets used to be labelled in UTC, which is honest but useless:
 * a reader looking for the 11am rush had to shift every row by eight hours in
 * their head. Grouping happens in the database over UTC timestamps; this turns
 * the result into the hour the event actually experienced.
 */
export function singaporeHourKey(instant: Date): string {
  const shifted = new Date(instant.getTime() + SGT_OFFSET_MINUTES * 60_000);
  return `${shifted.toISOString().slice(0, 13)}`;
}

/** Start of the local hour containing an instant, as a UTC instant. */
export function singaporeHourStart(instant: Date): Date {
  const shifted = instant.getTime() + SGT_OFFSET_MINUTES * 60_000;
  const floored = Math.floor(shifted / 3_600_000) * 3_600_000;
  return new Date(floored - SGT_OFFSET_MINUTES * 60_000);
}

/**
 * Which shift blocks contain this instant. Returns both during the configured
 * handover, and an empty array outside event hours — station scoping treats
 * "outside any block" as "not on shift".
 *
 * `alwaysOpen` exists so the capture screens can be exercised outside event
 * hours on a developer machine. It defaults to the environment flag, which
 * `config/env.ts` refuses to accept in production — a counter that never closes
 * would let a volunteer capture against a station they left hours ago.
 */
export function activeShiftBlocks(
  instant: Date = new Date(),
  alwaysOpen: boolean = env.SHIFT_HOURS_ALWAYS_OPEN,
): ShiftBlock[] {
  const ranges = shiftBlockRanges();
  if (alwaysOpen) return Object.keys(ranges) as ShiftBlock[];

  const minute = singaporeMinuteOfDay(instant);
  return (Object.keys(ranges) as ShiftBlock[]).filter((block) => {
    const range = ranges[block];
    return minute >= range.startMinute && minute < range.endMinute;
  });
}

/**
 * The instant a shift block ends on an event day, from the configured hours.
 * `eventDate` is the day's `@db.Date` anchor (UTC midnight of the local date).
 */
export function shiftBlockEndsAt(eventDate: Date, block: ShiftBlock): Date {
  const { endMinute } = shiftBlockRanges()[block];
  return new Date(eventDate.getTime() + (endMinute - SGT_OFFSET_MINUTES) * 60_000);
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
