import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Lock every existing actor/target in canonical order before any membership or credential row. */
export async function holdRosterPeople(tx: PrismaTransactionClient, input: {
  scope: EventScope; actorId: string; emails: readonly string[];
}) {
  const emails = [...new Set(input.emails.map((email) => email.toLowerCase()))];
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.actorId} OR lower(email) = ANY(${emails}::text[]) ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT m.id FROM "EventMembership" m JOIN "Person" p ON p.id = m."personId"
    WHERE m."eventId" = ${input.scope.eventId} AND (p.id = ${input.actorId} OR lower(p.email) = ANY(${emails}::text[]))
    ORDER BY m.id FOR UPDATE OF m`;
}
export async function rosterOrganisation(tx: PrismaTransactionClient, scope: EventScope) {
  const event = await tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { organisationId: true } });
  return event.organisationId;
}
export async function sameOrganisationIdentity(tx: PrismaTransactionClient,
  input: { personId: string; organisationId: string }): Promise<boolean> {
  const person = await tx.person.findUnique({ where: { id: input.personId }, select: {
    organisationMemberships: { where: { organisationId: input.organisationId }, select: { id: true }, take: 1 },
    eventMemberships: { where: { event: { organisationId: input.organisationId } }, select: { id: true }, take: 1 },
  } });
  return Boolean(person && (person.organisationMemberships.length || person.eventMemberships.length));
}
export function rosterActorRole(tx: PrismaTransactionClient, input: { scope: EventScope; personId: string }) {
  return tx.eventMembership.findUniqueOrThrow({ where: { eventId_personId: {
    eventId: input.scope.eventId, personId: input.personId,
  } }, select: { role: true } });
}
export function rosterTargetMembership(tx: PrismaTransactionClient, input: { scope: EventScope; personId: string }) {
  return tx.eventMembership.findUnique({ where: { eventId_personId: {
    eventId: input.scope.eventId, personId: input.personId,
  } }, select: { id: true, role: true, status: true } });
}
