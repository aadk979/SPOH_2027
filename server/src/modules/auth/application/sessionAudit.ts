import type { AuditContext } from '../../../platform/audit/index.js';
import { aliasEvent } from '../../../platform/event/currentEvent.js';
import { homeMembership } from './homeMembership.js';

/**
 * Sessions are opened and ended outside any event's path, so their audit
 * rows would name none. They are recorded in the person's home event (the
 * one the session opens in), with their membership of it; a caller with no
 * membership at all is recorded in Event #1.
 */
export async function inHomeEvent(
  audit: AuditContext,
  personId: string | null,
): Promise<AuditContext> {
  if (audit.eventId) return audit;
  const membership = personId ? await homeMembership(personId) : null;
  if (membership) return { ...audit, eventId: membership.eventId, membershipId: membership.id };
  return { ...audit, eventId: (await aliasEvent()).eventId, membershipId: null };
}
