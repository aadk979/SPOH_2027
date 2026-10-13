import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { validatedObjectKey } from '../domain/mediaKeys.js';

/** Validation and reads hold Event SHARE; expiry waits for all of them before deleting bytes. */
export async function lockMediaRetentionEvent(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId },
    select: { status: true, closedAt: true, organisationId: true } });
}

export async function expiredMediaKeys(tx: PrismaTransactionClient, scope: EventScope, closedAt: Date) {
  const done = await tx.auditLog.findFirst({ where: { eventId: scope.eventId, action: 'media.purge',
    after: { path: ['closedAt'], equals: closedAt.toISOString() } }, select: { id: true } });
  if (done) return null;
  const items = await tx.lostFoundItem.findMany({ where: { eventId: scope.eventId, photoKey: { not: null } }, select: { photoKey: true } });
  const issued = await tx.auditLog.findMany({ where: { eventId: scope.eventId, action: 'media.upload', entityType: 'MediaObject', entityId: { not: null } }, select: { entityId: true } });
  const verified = await tx.validatedMedia.findMany({ where: { eventId: scope.eventId }, select: { objectKey: true } });
  const derivatives = issued.filter((row): row is { entityId: string } => row.entityId !== null)
    .map((row) => validatedObjectKey(scope.eventId, row.entityId));
  return [...new Set([...items.map((row) => row.photoKey), ...issued.map((row) => row.entityId),
    ...verified.map((row) => row.objectKey), ...derivatives])]
    .filter((key): key is string => key !== null);
}

export async function clearMediaReferences(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.lostFoundItem.updateMany({ where: { eventId: scope.eventId, photoKey: { not: null } }, data: { photoKey: null } });
  await tx.validatedMedia.deleteMany({ where: { eventId: scope.eventId } });
}
