import { previousDate, zonedDate, zonedDayWindow, zonedOffset, zonedWallTime } from '@spoh/shared';

/**
 * An event's wall clock (ADR-003 §6, ADR-004 §3): its IANA timezone and the
 * minute after local midnight at which its operational day begins. Every
 * "today" and every local label on the server is read through one of these.
 */
export interface EventZone {
  timezone: string;
  dayBoundaryMinutes: number;
}

/**
 * The event day ("YYYY-MM-DD") an instant belongs to: the day whose window
 * `[boundary, next boundary)` contains it. With a 04:00 boundary, 02:00 on the
 * 8th still belongs to the 7th, so a late shift's captures stay on its day.
 */
export function eventDateOf(instant: Date, zone: EventZone): string {
  const date = zonedDate(instant, zone.timezone);
  const { start } = zonedDayWindow(date, zone.timezone, zone.dayBoundaryMinutes);
  return instant < start ? previousDate(date) : date;
}

/** When the event day containing `instant` began: the dashboard's "today" (F03-013). */
export function eventDayStart(instant: Date, zone: EventZone): Date {
  const date = eventDateOf(instant, zone);
  return zonedDayWindow(date, zone.timezone, zone.dayBoundaryMinutes).start;
}

/**
 * The `@db.Date` anchor of the event day containing `instant`, for matching an
 * `EventDay.date` column (see `eventDayAnchor`).
 */
export function eventDayAnchorOf(instant: Date, zone: EventZone): Date {
  return new Date(`${eventDateOf(instant, zone)}T00:00:00.000Z`);
}

/**
 * "2027-01-07 10:00": the local hour an hourly bucket starting at `instant`
 * covers, as the committee reads it. Both occurrences of a repeated hour read
 * the same; the report tells them apart (`labelHours`).
 */
export function localHourLabel(instant: Date, timezone: string): string {
  return `${zonedWallTime(instant, timezone).slice(0, 13).replace('T', ' ')}:00`;
}

/**
 * "2027-01-07 10:05 +08:00": an instant for a person reading an export. The
 * offset is printed on every value, so the rows either side of a DST change
 * cannot be misread (F01 time audit, case 9).
 */
export function localTimestamp(instant: Date, timezone: string): string {
  return `${zonedWallTime(instant, timezone).replace('T', ' ')} ${zonedOffset(instant, timezone)}`;
}
