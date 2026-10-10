import type { PrismaTransactionClient } from '../../../platform/db/client.js';

/** Credentials, other people's contact data and arbitrary audit payloads never enter the export. */
export async function exportPersonData(tx: PrismaTransactionClient, personId: string) {
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId },
    select: { id: true, displayName: true, email: true, phone: true, createdAt: true,
      lastSeenAt: true, deactivatedAt: true, piiErasedAt: true,
      eventMemberships: { select: { id: true, eventId: true, role: true, portfolio: true,
        status: true, invitedAt: true, acceptedAt: true, deactivatedAt: true, deactivatedReason: true, lastSeenAt: true } },
      refreshSessions: { select: { id: true, issuedAt: true, expiresAt: true, revokedAt: true,
        revokedReason: true, userAgent: true, lastUsedAt: true } },
      pushSubscriptions: { select: { id: true, userAgent: true, createdAt: true, lastSeenAt: true } } } });
  const activity = await tx.auditLog.findMany({ where: { actorId: personId },
    select: { id: true, eventId: true, action: true, entityType: true, entityId: true, createdAt: true },
    orderBy: { createdAt: 'asc' } });
  return { person, activity };
}

export async function erasePersonNotes(tx: PrismaTransactionClient, personId: string) {
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId },
    select: { eventMemberships: { select: { eventId: true, id: true } } } });
  const memberships = person.eventMemberships;
  for (const member of memberships) await tx.eventMembership.update({
    where: { eventId_id: { eventId: member.eventId, id: member.id } },
    data: { deactivatedReason: null, lastSeenAt: null },
  });
}
