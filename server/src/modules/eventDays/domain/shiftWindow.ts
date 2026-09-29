import { nextDate, wallTimeToInstant } from '@spoh/shared';

/**
 * When a shift of a template runs on a day, in the event's timezone
 * (ADR-007 §7). Its wall-clock hours are read on the day it starts; a template
 * that ends after midnight ends on the next calendar day. DST is handled by
 * `wallTimeToInstant`, so a shift across a transition is an hour shorter or
 * longer, never shifted.
 */
export function shiftWindow(
  date: string,
  template: { startLocal: string; endLocal: string; endsNextDay: boolean },
  timezone: string,
): { startsAt: Date; endsAt: Date } {
  return {
    startsAt: wallTimeToInstant(date, template.startLocal, timezone),
    endsAt: wallTimeToInstant(
      template.endsNextDay ? nextDate(date) : date,
      template.endLocal,
      timezone,
    ),
  };
}
