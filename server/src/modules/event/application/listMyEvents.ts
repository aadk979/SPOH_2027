import type { MyEvent } from '@spoh/shared';
import { aliasEvent } from '../../../platform/event/events.js';
import { findMembershipsWithEvents } from '../data/repo.js';

/** The events a person belongs to, for the client's picker and switcher (ADR-001 §5). */
export async function listMyEvents(personId: string): Promise<MyEvent[]> {
  const [memberships, legacy] = await Promise.all([
    findMembershipsWithEvents(personId),
    aliasEvent().catch(() => null),
  ]);
  return memberships.map(({ role, status, event }) => ({
    ...event,
    role,
    membershipStatus: status,
    servesLegacyPaths: event.id === legacy?.eventId,
  }));
}
