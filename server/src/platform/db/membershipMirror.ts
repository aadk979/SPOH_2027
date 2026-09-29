import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';

/**
 * Expand phase only (ADR-001 Migration; P09.5 to P09.10): the roster still
 * edits role, portfolio, manager and standing on the Person row, and every such
 * write mirrors them onto the person's membership of the event, creating it
 * when missing. Authorization reads the membership. P09.10 drops the Person
 * columns, the edits move to the membership, and this goes away.
 */
export async function mirrorMembership(
  tx: PrismaTransactionClient,
  scope: EventScope,
  personId: string,
): Promise<{ id: string }> {
  const { eventId } = scope;
  const person = await tx.person.findUniqueOrThrow({
    where: { id: personId },
    select: {
      role: true,
      portfolio: true,
      reportsToId: true,
      active: true,
      deactivatedAt: true,
      deactivatedReason: true,
      lastSeenAt: true,
    },
  });
  const manager = person.reportsToId
    ? await tx.eventMembership.findUnique({
        where: { eventId_personId: { eventId, personId: person.reportsToId } },
        select: { id: true },
      })
    : null;
  const data = {
    role: person.role,
    portfolio: person.portfolio,
    reportsToId: manager?.id ?? null,
    status: person.active ? ('ACTIVE' as const) : ('DEACTIVATED' as const),
    deactivatedAt: person.deactivatedAt,
    deactivatedReason: person.deactivatedReason,
    lastSeenAt: person.lastSeenAt,
  };
  return tx.eventMembership.upsert({
    where: { eventId_personId: { eventId, personId } },
    create: { eventId, personId, ...data },
    update: data,
    select: { id: true },
  });
}

/**
 * A person's membership id in the event, for a membership column written
 * beside a person column (expand phase, P09.5). Null when they have none.
 */
export async function membershipIdOf(
  tx: PrismaTransactionClient,
  scope: EventScope,
  personId: string | null,
): Promise<string | null> {
  if (!personId) return null;
  const membership = await tx.eventMembership.findUnique({
    where: { eventId_personId: { eventId: scope.eventId, personId } },
    select: { id: true },
  });
  return membership?.id ?? null;
}
