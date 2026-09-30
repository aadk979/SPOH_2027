import type { EventSummary } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { findEventSummary } from '../data/repo.js';

/** The event's name, timezone and locale, for a client to show anything in. */
export async function getEventSummary(scope: EventScope): Promise<EventSummary> {
  return findEventSummary(scope.eventId);
}
