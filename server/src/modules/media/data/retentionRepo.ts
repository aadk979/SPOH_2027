import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function expiredMediaKeys(tx: PrismaTransactionClient, scope: EventScope, closedAt: Date) {
  const done = await tx.auditLog.findFirst({ where: { eventId: scope.eventId, action: 'media.purge',
    after: { path: ['closedAt'], equals: closedAt.toISOString() } }, select: { id: true } });
  if (done) return null;
  const items = await tx.lostFoundItem.findMany({ where: { eventId: scope.eventId, photoKey: { not: null } }, select: { photoKey: true } });
  const issued = await tx.auditLog.findMany({ where: { eventId: scope.eventId, action: 'media.upload', entityType: 'MediaObject', entityId: { not: null } }, select: { entityId: true } });
  return [...new Set([...items.map((row) => row.photoKey), ...issued.map((row) => row.entityId)])]
    .filter((key): key is string => key !== null);
}

export async function clearMediaReferences(tx: PrismaTransactionClient, scope: EventScope) {
  await tx.lostFoundItem.updateMany({ where: { eventId: scope.eventId, photoKey: { not: null } }, data: { photoKey: null } });
}
