import type { EventScope } from '../../../platform/db/eventScope.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export async function archiveRetentionEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR SHARE`;
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId },
    select: { status: true, archivedAt: true, organisationId: true } });
}

export function archivedPeople(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.person.findMany({
    where: { piiErasedAt: null, eventMemberships: { some: { eventId: scope.eventId } } },
    select: { id: true, organisationMemberships: { where: { role: 'PLATFORM_ADMIN' }, select: { id: true } },
      eventMemberships: { select: { eventId: true, status: true,
        event: { select: { status: true, archivedAt: true, organisationId: true } } } } },
  });
}

export async function lockRetentionPerson(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  // A concurrent membership insert takes the person's FK lock. Read only after this wait.
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${id} FOR UPDATE`;
  return (await archivedPeople(tx, scope)).find((row) => row.id === id);
}

export async function clearArchivedNotes(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.eventMembership.updateMany({ where: { eventId: scope.eventId, deactivatedReason: { not: null } },
    data: { deactivatedReason: null, lastSeenAt: null } });
}

export async function anonymisePerson(tx: PrismaTransactionClient, input: { personId: string; now: Date }) {
  const changed = await tx.person.updateMany({
    where: { id: input.personId, piiErasedAt: null },
    data: { displayName: 'Archived staff member', email: `archived-${input.personId}@invalid.example`,
      phone: null, lastSeenAt: null, deactivatedAt: input.now, piiErasedAt: input.now },
  });
  if (!changed.count) return 0;
  await tx.pushSubscription.deleteMany({ where: { volunteerId: input.personId } });
  await tx.refreshSession.updateMany({ where: { volunteerId: input.personId, revokedAt: null },
    data: { revokedAt: input.now, revokedReason: 'staff-retention', providerTokenEncrypted: null, providerTokenExpiresAt: null } });
  return changed.count;
}

export async function scheduleStaffRetention(tx: PrismaTransactionClient, input: { eventId: string; runAt: Date }) {
  await tx.scheduledAction.createMany({ data: { eventId: input.eventId, type: 'retention.staff',
    payload: {}, runAt: input.runAt, scheduledFor: input.runAt,
    dedupeKey: `archive-staff:${input.eventId}`, createdByPersonId: null }, skipDuplicates: true });
}
