import { randomUUID } from 'node:crypto';
import { EventContent } from '@spoh/shared';
import { requireCurrentOrganisationPermission } from '../../../platform/access/currentOrganisation.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { publishedRow } from '../data/repo.js';
import { insertStorageIntent } from '../data/storageIntentRepo.js';
import { cloneStorageKeys, type ContentStoragePlan } from './storagePlan.js';

export interface CloneContentStoragePlan extends ContentStoragePlan {
  sourceVersionId: string; images: Array<{ sourceKey: string; key: string }>;
}
export async function planCloneContentInTransaction(tx: PrismaTransactionClient,
  input: { sourceEventId: string; eventId: string; personId: string; sub?: string; now: Date }) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${input.sourceEventId} FOR SHARE`;
  const event = await tx.event.findUnique({ where: { id: input.sourceEventId }, select: { organisationId: true } });
  if (!event) throw new NotFoundError('Event');
  await requireCurrentOrganisationPermission(tx, { organisationId: event.organisationId,
    personId: input.personId, subject: input.sub, action: 'Platform.CloneEvent' });
  const source = await publishedRow({ eventId: input.sourceEventId }, {}, tx);
  if (!source) return undefined;
  const images = cloneStorageKeys(EventContent.parse(source.body), input.eventId);
  if (!images.length) return undefined;
  const intent = await insertStorageIntent(tx, { eventId: input.sourceEventId }, {
    id: randomUUID(), contentVersionId: randomUUID(), targetEventId: input.eventId,
    objectKeys: images.map((image) => image.key), createdAt: input.now,
    cleanupAfter: new Date(input.now.getTime() + 3600_000),
  });
  return { ...intent, sourceVersionId: source.id, images } satisfies CloneContentStoragePlan;
}
/** Commit the cleanup plan before the caller opens the clone's atomic Event transaction. */
export function planCloneContent(input: {
  sourceEventId: string; eventId: string; personId: string; sub?: string; now: Date;
}) {
  return prisma.$transaction((tx) => planCloneContentInTransaction(tx, input), { timeout: 30_000 });
}
