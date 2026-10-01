import type { PrismaTransactionClient } from './client.js';
import type { EventScope } from './eventScope.js';

/**
 * A person's membership id in the event, for a membership column written
 * beside a person column. Null when they have none. (The mirror that copied
 * Person's role and standing onto memberships went with those columns, P09.10.)
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
