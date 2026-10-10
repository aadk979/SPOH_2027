import type { CommitteeRole } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Serialises grant changes for one event, so two editors cannot interleave a toggle. */
export async function lockPermissionEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { status: true } });
}

export async function permissionReview(db: PrismaTransactionClient, scope: EventScope) {
  return db.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: {
      permissionsVersion: true,
      permissionsReviewedVersion: true,
      permissionsReviewedAt: true,
    },
  });
}

export async function recordPermissionReview(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { version: number; now: Date },
) {
  return tx.event.updateMany({
    where: { id: scope.eventId, permissionsVersion: input.version },
    data: { permissionsReviewedVersion: input.version, permissionsReviewedAt: input.now },
  });
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
