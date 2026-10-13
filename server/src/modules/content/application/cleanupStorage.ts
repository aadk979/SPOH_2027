import { EventContent } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ServiceUnavailableError } from '../../../platform/errors/index.js';
import { deleteStorageIntent, dueStorageIntent, lockStorageEvents, lockStorageIntent,
  replaceStorageIntentKeys, storageReferences } from '../data/storageIntentRepo.js';
import { contentReferences } from '../domain/contentRules.js';
import { imageManifest } from '../domain/imageManifest.js';
import { contentStorage } from './storage.js';
import { assertOwnedStorageKeys } from './storagePlan.js';

const MAX_KEYS_PER_RUN = 6;
async function referencedKeys(tx: PrismaTransactionClient, eventId: string) {
  const rows = await storageReferences(tx, { eventId });
  return new Set([...rows.uploads.map((row) => row.key), ...rows.publications.flatMap((row) =>
    [row.objectKey, ...imageManifest.parse(row.imageManifest).map((image) => image.key),
      ...contentReferences(EventContent.parse(row.body)).images])]);
}

/** One bounded exact-key crash lease; Event fences prevent publication/clone admission during deletion. */
export async function cleanupContentStorage(tx: PrismaTransactionClient,
  input: { now: Date; audit: AuditContext }) {
  const candidate = (await dueStorageIntent(tx, input.now))[0];
  if (!candidate) return 0;
  await lockStorageEvents(tx, candidate);
  const scope = { eventId: candidate.eventId };
  const intent = await lockStorageIntent(tx, scope, candidate.id);
  if (!intent || intent.cleanupAfter > input.now) return 0;
  assertOwnedStorageKeys(intent);
  const retained = await referencedKeys(tx, intent.targetEventId);
  const unreferenced = intent.objectKeys.filter((key) => !retained.has(key));
  const deleteObject = contentStorage().deleteObject;
  if (unreferenced.length && !deleteObject)
    throw new ServiceUnavailableError('Content cleanup storage is unavailable.');
  const keys = unreferenced.slice(0, MAX_KEYS_PER_RUN);
  for (const key of keys) await deleteObject!(key);
  const remaining = unreferenced.slice(keys.length);
  if (remaining.length) await replaceStorageIntentKeys(tx, scope, { id: intent.id, objectKeys: remaining });
  else await deleteStorageIntent(tx, scope, intent.id);
  await writeAudit(tx, { ...input.audit, eventId: intent.eventId, action: 'content.storage.prune',
    entityType: 'ContentStorageIntent', entityId: intent.id,
    after: { objects: keys.length, completed: remaining.length === 0, reason: 'uncommitted-storage' } });
  return keys.length;
}
