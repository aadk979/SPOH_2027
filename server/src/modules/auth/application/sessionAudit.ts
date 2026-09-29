import type { AuditContext } from '../../../platform/audit/index.js';
import { currentEvent } from '../../../platform/event/currentEvent.js';
import { findMembership } from '../data/repo.js';

/**
 * Sessions are opened and ended before a request carries its event, so their
 * audit rows would name none. They happen in the current event (ADR-001), so
 * that is the event recorded, with the person's membership of it.
 */
export async function inCurrentEvent(
  audit: AuditContext,
  personId: string | null,
): Promise<AuditContext> {
  if (audit.eventId) return audit;
  const scope = await currentEvent();
  const membership = personId ? await findMembership(scope, personId) : null;
  return { ...audit, eventId: scope.eventId, membershipId: membership?.id ?? null };
}
