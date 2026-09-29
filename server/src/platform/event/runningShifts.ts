import { zonedDate } from '@spoh/shared';
import { env } from '../../config/env.js';
import type { EventScope } from '../db/eventScope.js';
import { eventDayAnchor } from '../time/index.js';
import { eventTimezone } from './currentEvent.js';

/**
 * Which shifts are running at an instant, as a filter on `Shift` (P09.5): the
 * shift's own start and end decide, so a handover overlap, an overnight shift
 * and a DST day all hold. With `SHIFT_HOURS_ALWAYS_OPEN` (development only,
 * refused in production) every shift of the event's day counts, so the capture
 * screens work outside event hours.
 */
export async function runningShifts(
  scope: EventScope,
  now: Date = new Date(),
): Promise<{ startsAt: { lte: Date }; endsAt: { gt: Date } } | { eventDay: { date: Date } }> {
  if (env.SHIFT_HOURS_ALWAYS_OPEN) {
    return { eventDay: { date: eventDayAnchor(zonedDate(now, await eventTimezone(scope))) } };
  }
  return { startsAt: { lte: now }, endsAt: { gt: now } };
}
