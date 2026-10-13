import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function insertStorageIntent(tx: PrismaTransactionClient, scope: EventScope, input: {
  id: string; contentVersionId: string; targetEventId: string; objectKeys: string[]; createdAt: Date; cleanupAfter: Date;
}) {
  return tx.contentStorageIntent.create({ data: { ...input, eventId: scope.eventId } });
}
export async function lockStorageIntent(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  await tx.$queryRaw`SELECT id FROM "ContentStorageIntent" WHERE "eventId" = ${scope.eventId}
    AND id = ${id}::uuid FOR UPDATE`;
  return tx.contentStorageIntent.findFirst({ where: { eventId: scope.eventId, id } });
}
/** Platform-only maintenance discovers one owning scope, then every model query names it. */
export function dueStorageIntent(tx: PrismaTransactionClient, now: Date) {
  return tx.$queryRaw<Array<{ id: string; eventId: string; targetEventId: string }>>`
    SELECT id, "eventId", "targetEventId" FROM "ContentStorageIntent"
    WHERE "cleanupAfter" <= ${now} ORDER BY "cleanupAfter", "eventId", id LIMIT 1`;
}
export async function lockStorageEvents(tx: PrismaTransactionClient, input: { eventId: string; targetEventId: string }) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ANY(${[...new Set([input.eventId, input.targetEventId])]}::text[])
    ORDER BY id FOR UPDATE`;
}
export async function storageReferences(tx: PrismaTransactionClient, scope: EventScope) {
  const publications = await tx.contentVersion.findMany({ where: { eventId: scope.eventId },
    select: { objectKey: true, imageManifest: true, body: true } });
  const uploads = await tx.contentUploadReceipt.findMany({ where: { eventId: scope.eventId }, select: { key: true } });
  return { publications, uploads };
}
export function replaceStorageIntentKeys(tx: PrismaTransactionClient, scope: EventScope,
  input: { id: string; objectKeys: string[] }) {
  return tx.contentStorageIntent.update({ where: { eventId_id: { eventId: scope.eventId, id: input.id } },
    data: { objectKeys: input.objectKeys } });
}
export function deleteStorageIntent(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.contentStorageIntent.deleteMany({ where: { eventId: scope.eventId, id } });
}
