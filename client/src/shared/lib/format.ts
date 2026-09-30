import type { ShiftBlock, ShiftBlockWindows } from '@spoh/shared';

/**
 * Display formatting.
 *
 * These lived at the bottom of `app/chief/page.tsx`, and the IC console, the
 * reports screen and TV mode each imported `readableCategory` from that page
 * module — which pulls a `'use client'` page component, its dashboard hooks and
 * its whole query tree into three unrelated route bundles. Same strings, no
 * import cycle, no passenger code.
 *
 * Every time is rendered on the event's wall clock and in its locale, passed
 * in explicitly (ADR-003 §6). A volunteer's phone may be on any timezone it
 * likes; the shift board is not. Screens get both from `useEventTime()`.
 */

/** The event's IANA timezone and locale: what every time on screen is read in. */
export interface EventClockFormat {
  timeZone: string;
  locale: string;
}

function parsed(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * "14:05", or "02:05 pm", by the locale. Without the event's clock (before
 * `/me` has loaded) it shows a dash: a time in the device's zone would be a
 * wrong time that looks right.
 */
export function formatTime(iso: string | null | undefined, clock: EventClockFormat | null): string {
  const date = parsed(iso);
  if (!date || !clock) return '—';
  return date.toLocaleTimeString(clock.locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: clock.timeZone,
  });
}

/** "7 Jan, 14:05", by the locale. */
export function formatDateTime(
  iso: string | null | undefined,
  clock: EventClockFormat | null,
): string {
  const date = parsed(iso);
  if (!date || !clock) return '—';
  return date.toLocaleString(clock.locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: clock.timeZone,
  });
}

/** Thousands separators, and never a bare number in a sentence about counts. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return value.toLocaleString('en-SG');
}

/** 3h20m — for time on station, where a decimal of an hour reads as noise. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return '0m';
  }
  const rounded = Math.floor(minutes);
  const hours = Math.floor(rounded / 60);
  return hours > 0 ? `${hours}h${rounded % 60}m` : `${rounded}m`;
}

/**
 * A shift block as the roster prints it, from the configured hours: an admin
 * moves them for a dry run, and a label compiled into the client then showed
 * the old times while attendance followed the new ones (F01-046).
 */
export function blockLabel(block: ShiftBlock, blocks: ShiftBlockWindows): string {
  const window = blocks[block];
  return `${window.start}–${window.end}`;
}

/**
 * The same two blocks as a word.
 *
 * A swap request reads "Room A, 7 Jan, morning" — the exact times are not what
 * an IC is deciding on, and printing them there makes the line long enough to
 * wrap on a phone.
 */
export function blockWord(block: string): string {
  return block === 'MORNING' ? 'morning' : 'afternoon';
}

/**
 * Visitor categories, exactly as slide 14 words them.
 *
 * Unknown keys fall through to the raw value rather than throwing: a category
 * added on the server should show up as an ugly string on a dashboard, not
 * take the dashboard down.
 */
const CATEGORY_LABELS: Record<string, string> = {
  SEC_1: 'Sec 1',
  SEC_2: 'Sec 2',
  SEC_3: 'Sec 3',
  SEC_4: 'Sec 4',
  SEC_5: 'Sec 5',
  GRADUATED_AWAITING_RESULTS: 'Graduated',
  PARENT_GUARDIAN: 'Parent / Guardian',
  OTHER: 'Other',
};

export function readableCategory(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

/** SAFETY_IC → Safety Ic. Good enough for a fallback beside a real job title. */
export function readableRole(role: string): string {
  return String(role)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
