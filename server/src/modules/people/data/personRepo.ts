import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

export async function personDetail(id: string, tx: PrismaTransactionClient = prisma) {
  return tx.person.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      email: true,
      cognitoSub: true,
      deactivatedAt: true,
      piiErasedAt: true,
      organisationMemberships: { select: { organisationId: true } },
      eventMemberships: {
        select: {
          id: true,
          eventId: true,
          role: true,
          status: true,
          acceptedAt: true,
          lastSeenAt: true,
          event: { select: { name: true, organisationId: true } },
        },
        orderBy: { event: { createdAt: 'asc' } },
      },
    },
  });
}

export async function holdManagedPerson(tx: PrismaTransactionClient, input: { targetId: string; actorId: string }) {
  await tx.$queryRaw`SELECT e.id FROM "Event" e WHERE EXISTS (
    SELECT 1 FROM "EventMembership" m WHERE m."eventId" = e.id AND m."personId" = ${input.targetId}
  ) ORDER BY e.id FOR SHARE OF e`;
  const ids = [...new Set([input.targetId, input.actorId])].sort();
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "personId" = ANY(${ids}::text[]) ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "personId" = ${input.targetId} ORDER BY id FOR UPDATE`;
}

export async function changePersonStanding(
  tx: PrismaTransactionClient,
  input: { id: string; at: Date | null; reason?: string },
) {
  await tx.person.update({ where: { id: input.id }, data: { deactivatedAt: input.at } });
  const person = await tx.person.findUniqueOrThrow({
    where: { id: input.id },
    select: {
      eventMemberships: {
        select: { id: true, eventId: true, status: true, personSuspendedStatus: true },
      },
    },
  });
  for (const membership of person.eventMemberships) {
    if (!standingChanges(membership, input.at)) continue;
    await tx.eventMembership.update({
      where: { eventId_id: { eventId: membership.eventId, id: membership.id } },
      data: {
        status: input.at ? 'DEACTIVATED' : (membership.personSuspendedStatus ?? membership.status),
        personSuspendedStatus: input.at
          ? (membership.personSuspendedStatus ?? membership.status)
          : null,
        deactivatedAt: input.at,
        deactivatedReason: input.at ? input.reason : null,
      },
    });
  }
}

function standingChanges(member: { status: string; personSuspendedStatus: string | null }, at: Date | null) {
  if (member.status === 'ENDED') return false;
  return at ? member.status !== 'DEACTIVATED' : member.personSuspendedStatus !== null;
}
