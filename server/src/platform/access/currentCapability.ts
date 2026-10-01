import { roleHasCapability, type Capability } from '@spoh/shared';
import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ForbiddenError } from '../errors/index.js';

/** Recheck an event permission under a membership lock before a sensitive mutation. */
export async function requireCurrentCapability(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; membershipId: string; personId: string; capability: Capability },
): Promise<void> {
  const { scope, membershipId, personId, capability } = input;
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
    AND id = ${membershipId} AND "personId" = ${personId} FOR SHARE`;
  const member = await tx.eventMembership.findFirst({
    where: { eventId: scope.eventId, id: membershipId, personId },
    select: { status: true, role: true },
  });
  if (!member || member.status !== 'ACTIVE' || !roleHasCapability(member.role, capability)) {
    throw new ForbiddenError('Your event permission changed. Reload before trying again.', {
      required: capability,
    });
  }
}
