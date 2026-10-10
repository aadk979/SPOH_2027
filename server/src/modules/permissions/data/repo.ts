import type { CommitteeRole } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Serialises grant changes for one event, so two editors cannot interleave a toggle. */
export async function lockPermissionEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
}

export async function hasGrant(
  tx: PrismaTransactionClient,
  scope: EventScope,
  grant: { role: CommitteeRole; action: string },
): Promise<boolean> {
  const row = await tx.rolePermission.findUnique({
    where: { eventId_role_action: { eventId: scope.eventId, ...grant } },
    select: { id: true },
  });
  return row !== null;
}

export async function addGrant(
  tx: PrismaTransactionClient,
  scope: EventScope,
  grant: { role: CommitteeRole; action: string },
) {
  return tx.rolePermission.create({
    data: { eventId: scope.eventId, ...grant },
    select: { id: true },
  });
}

export async function removeGrant(
  tx: PrismaTransactionClient,
  scope: EventScope,
  grant: { role: CommitteeRole; action: string },
) {
  return tx.rolePermission.delete({
    where: { eventId_role_action: { eventId: scope.eventId, ...grant } },
    select: { id: true },
  });
}

/** A person's membership of this event; null when they have none here. */
export async function findMember(db: PrismaTransactionClient, scope: EventScope, personId: string) {
  return db.eventMembership.findFirst({
    where: { eventId: scope.eventId, personId },
    select: { id: true, role: true },
  });
}
