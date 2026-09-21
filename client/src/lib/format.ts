/**
 * Display formatting.
 *
 * These lived at the bottom of `app/chief/page.tsx`, and the IC console, the
 * reports screen and TV mode each imported `readableCategory` from that page
 * module — which pulls a `'use client'` page component, its dashboard hooks and
 * its whole query tree into three unrelated route bundles. Same strings, no
 * import cycle, no passenger code.
 *
 * Every time is rendered in Asia/Singapore explicitly. A volunteer's phone may
 * be on any timezone it likes; the shift board is not.
 */

const TZ = 'Asia/Singapore';

/** 14:05 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

/** 7 Jan, 14:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
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

/** The two shift blocks, as the roster prints them. */
export function blockLabel(block: string): string {
  return block === 'MORNING' ? '09:30–14:00' : '13:30–18:00';
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
