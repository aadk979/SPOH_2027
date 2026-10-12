import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ROLE_PRECEDENCE, type CommitteeRole } from '@spoh/shared';
import { MAX_DEVICES_PER_PERSON } from '../domain/delivery.js';

/** Sibling relation loads overlap on a transaction's single pg connection. */
async function recipientDetails(tx: PrismaTransactionClient, personIds: readonly string[]) {
  // Bulk hydration keeps a fixed query count without sibling relation loads.
  const preferences = await tx.noticePreference.findMany({ where: { personId: { in: [...personIds] } } });
  const devices = await tx.person.findMany({ where: { id: { in: [...personIds] } },
    select: { id: true, pushSubscriptions: { select: { id: true },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], take: MAX_DEVICES_PER_PERSON } } });
  const preferencesByPerson = new Map(preferences.map((row) => [row.personId, row]));
  const devicesByPerson = new Map(devices.map((row) => [row.id, row.pushSubscriptions]));
  return (personId: string) => ({ noticePreference: preferencesByPerson.get(personId) ?? null,
    pushSubscriptions: devicesByPerson.get(personId) ?? [] });
}

export async function noticeRecipients(scope: EventScope, input: {
  tx: PrismaTransactionClient; personIds: readonly string[];
}) {
  const members = await input.tx.eventMembership.findMany({ where: { eventId: scope.eventId,
    personId: { in: [...input.personIds] }, status: { in: ['ACTIVE', 'INVITED'] },
    person: { deactivatedAt: null } }, select: { id: true, personId: true, status: true } });
  if (!members.length) return [];
  const details = await recipientDetails(input.tx, members.map((row) => row.personId));
  return members.map((member) => ({ ...member, person: details(member.personId) }));
}

export function noticeHistoryRecipients(scope: EventScope, input: { tx: PrismaTransactionClient; personIds: readonly string[] }) {
  return input.tx.eventMembership.findMany({ where: { eventId: scope.eventId,
    personId: { in: [...input.personIds] }, person: { deactivatedAt: null },
    OR: [{ status: 'ACTIVE' }, { status: 'ENDED', event: { status: 'ARCHIVED' } }] },
    select: { id: true, personId: true } });
}

export async function archiveNoticeRecipients(scope: EventScope, input: {
  tx: PrismaTransactionClient; personIds: readonly string[];
}) {
  const event = await input.tx.event.findUniqueOrThrow({ where: { id: scope.eventId },
    select: { organisationId: true } });
  const people = await input.tx.person.findMany({ where: { id: { in: [...input.personIds] }, deactivatedAt: null,
    organisationMemberships: { some: { organisationId: event.organisationId, role: 'PLATFORM_ADMIN' } } },
    select: { id: true } });
  if (!people.length) return [];
  const personIds = people.map((person) => person.id);
  const details = await recipientDetails(input.tx, personIds);
  const memberships = await input.tx.eventMembership.findMany({
    where: { eventId: scope.eventId, personId: { in: personIds } }, select: { id: true, status: true, personId: true } });
  return people.map((person) => ({ ...person, ...details(person.id),
    eventMemberships: memberships.filter((member) => member.personId === person.id).map(({ id, status }) => ({ id, status })) }));
}

export async function activeNoticeAudience(scope: EventScope, input: {
  tx: PrismaTransactionClient; roles?: readonly CommitteeRole[]; minimumRole?: CommitteeRole; excludePersonId?: string;
}) {
  const roles = input.roles ?? (input.minimumRole ? (Object.keys(ROLE_PRECEDENCE) as CommitteeRole[])
    .filter((role) => ROLE_PRECEDENCE[role] <= ROLE_PRECEDENCE[input.minimumRole!]) : undefined);
  const rows = await input.tx.eventMembership.findMany({ where: { eventId: scope.eventId,
    status: 'ACTIVE', person: { deactivatedAt: null },
    ...(roles ? { role: { in: [...roles] } } : {}),
    ...(input.excludePersonId ? { personId: { not: input.excludePersonId } } : {}),
  }, select: { personId: true } });
  return rows.map((row) => row.personId);
}
