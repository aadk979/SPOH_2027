import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findEventDayRow } from '../data/repo.js';

/**
 * The event day a record optionally names: null when it names none, 404 when
 * it names a day that is not this event's (ADR-001 §2).
 */
export async function requireEventDay(
  scope: EventScope,
  eventDayId: string | null | undefined,
): Promise<string | null> {
  if (!eventDayId) return null;
  if (!(await findEventDayRow(scope, eventDayId))) throw new NotFoundError('Event day');
  return eventDayId;
}
