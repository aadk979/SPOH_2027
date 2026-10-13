import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function personNeedsMfa(personId: string, tx: PrismaTransactionClient = prisma): Promise<boolean> {
  const person = await tx.person.findUniqueOrThrow({
    where: { id: personId },
    select: {
      organisationMemberships: { where: { role: 'PLATFORM_ADMIN' }, select: { id: true } },
      eventMemberships: {
        where: {
          status: { in: ['ACTIVE', 'INVITED'] },
          event: { status: { not: 'ARCHIVED' } },
          role: { in: ['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR'] },
        },
        select: { id: true },
      },
    },
  });
  return person.organisationMemberships.length > 0 || person.eventMemberships.length > 0;
}

export async function acceptMembership(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { personId: string; at: Date },
) {
  const changed = await tx.eventMembership.updateMany({
    where: { eventId: scope.eventId, personId: input.personId, status: 'INVITED' },
    data: { status: 'ACTIVE', acceptedAt: input.at },
  });
  return changed.count > 0;
}

export async function mfaSession(id: string, tx: PrismaTransactionClient = prisma) {
  return tx.refreshSession.findUnique({
    where: { id },
    include: { volunteer: { select: { cognitoSub: true, deactivatedAt: true, piiErasedAt: true } } },
  });
}

/** Event archive also takes Event before Person; visit stamping requires UPDATE, never a later upgrade. */
export async function lockCredentialPerson(tx: PrismaTransactionClient, personId: string): Promise<void> {
  await tx.$queryRaw`SELECT e.id FROM "Event" e WHERE EXISTS (
    SELECT 1 FROM "EventMembership" m WHERE m."eventId" = e.id AND m."personId" = ${personId}
  ) ORDER BY e.id FOR SHARE OF e`;
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${personId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "personId" = ${personId} ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "personId" = ${personId} ORDER BY id FOR SHARE`;
}
