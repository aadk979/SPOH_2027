import type { EventScope } from '../db/eventScope.js';
import { eventDayAnchorOf, eventDayStart } from '../time/index.js';
import { eventZone } from './events.js';

/**
 * "Today" for an event (ADR-004 §3): the event day containing `now` in the
 * event's timezone, starting at its day boundary. Replaces the fixed-offset
 * helpers (F01-023, P09.6).
 */

/** The `@db.Date` anchor of today's event day, for matching `EventDay.date`. */
export async function eventToday(scope: EventScope, now: Date): Promise<Date> {
  return eventDayAnchorOf(now, await eventZone(scope));
}

/** When today's event day began: the lower bound of every "today" total. */
export async function eventTodayStart(scope: EventScope, now: Date): Promise<Date> {
  return eventDayStart(now, await eventZone(scope));
}
