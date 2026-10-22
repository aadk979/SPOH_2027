import type { EventScope } from '../db/eventScope.js';
import { eventDayWindow } from './events.js';

/** A day narrows explicit bounds; it never widens them or changes an all-days query. */
export async function reportingRange(
  scope: EventScope,
  query: { eventDayId?: string; from?: string; to?: string },
): Promise<{ from?: Date; to?: Date }> {
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if (!query.eventDayId) return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const day = await eventDayWindow(scope, query.eventDayId);
  return {
    from: from && from > day.start ? from : day.start,
    to: to && to < day.end ? to : day.end,
  };
}
