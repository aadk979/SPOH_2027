import type { PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';

/** Select the policy principal from this organisation's current database standing.
 * Mutations still recheck Cedar under their actor and organisation locks.
 */
export async function isPlatformAdministrator(
  db: PrismaTransactionClient,
  input: { scope: EventScope; personId: string },
): Promise<boolean> {
  const event = await db.event.findUnique({
    where: { id: input.scope.eventId },
    select: { organisationId: true },
  });
  if (!event) return false;
  const member = await db.organisationMembership.findUnique({
    where: {
      organisationId_personId: { organisationId: event.organisationId, personId: input.personId },
    },
    select: { role: true, person: { select: { deactivatedAt: true, piiErasedAt: true } } },
  });
  return (
    member?.role === 'PLATFORM_ADMIN' &&
    member.person.deactivatedAt === null &&
    member.person.piiErasedAt === null
  );
}
