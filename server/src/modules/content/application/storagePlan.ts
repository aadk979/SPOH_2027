import { randomUUID } from 'node:crypto';
import { EventContent, ERROR_CODES } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { insertStorageIntent, lockStorageIntent } from '../data/storageIntentRepo.js';
import { contentReferences, publicationImageKey } from '../domain/contentRules.js';
import { checkedContentDraft, prepareContentMutation, validateContentReferences, type ContentActor } from './prepare.js';

export interface ContentStoragePlan {
  id: string; eventId: string; targetEventId: string; contentVersionId: string; objectKeys: string[];
}
export function assertOwnedStorageKeys(plan: ContentStoragePlan) {
  const publication = `content/${plan.targetEventId}/${plan.contentVersionId}`;
  const drafts = `drafts/${plan.targetEventId}/`;
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (!/^[a-z0-9_-]+$/i.test(plan.targetEventId) || !uuid.test(plan.contentVersionId) ||
    plan.objectKeys.some((key) => key !== `${publication}.json` &&
      !(key.startsWith(`${publication}/map-`) && /^\d+$/.test(key.slice(`${publication}/map-`.length))) &&
      !(key.startsWith(drafts) && uuid.test(key.slice(drafts.length)))))
    throw new ValidationError('The content storage plan contains an unowned object.');
}
const LEASE_MS = 3600_000;

export async function planPublicationInTransaction(tx: PrismaTransactionClient,
  input: { actor: ContentActor; expectedVersion: number; runAt?: Date }) {
  const { scope, now } = await prepareContentMutation(tx, { actor: input.actor, action: 'Content.Publish' });
  const draft = await checkedContentDraft(tx, input);
  if (draft.reviewedVersion !== draft.version)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Review this draft version before publishing it.');
  const body = EventContent.parse(draft.body);
  const images = await validateContentReferences(tx, { actor: input.actor, body });
  const id = randomUUID();
  return insertStorageIntent(tx, scope, { id, contentVersionId: id, targetEventId: scope.eventId,
    objectKeys: [...images.map((_, index) => publicationImageKey(scope.eventId, id, index)), `content/${scope.eventId}/${id}.json`],
    createdAt: now, cleanupAfter: new Date((input.runAt ?? now).getTime() + LEASE_MS) });
}
export function planPublication(input: { actor: ContentActor; expectedVersion: number }) {
  return prisma.$transaction((tx) => planPublicationInTransaction(tx, input), { timeout: 30_000 });
}

export async function requireStoragePlan(tx: PrismaTransactionClient, scope: EventScope,
  input: { id: string; targetEventId: string; now: Date }) {
  const plan = await lockStorageIntent(tx, scope, input.id);
  if (!plan) throw new NotFoundError('Content storage plan');
  if (plan.targetEventId !== input.targetEventId || plan.cleanupAfter <= input.now)
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The content storage plan expired. Start the operation again.');
  assertOwnedStorageKeys(plan);
  return plan;
}
export function assertPlannedKeys(plan: ContentStoragePlan, keys: string[]) {
  if (keys.length !== plan.objectKeys.length || keys.some((key) => !plan.objectKeys.includes(key)))
    throw new ConflictError(ERROR_CODES.CONFLICT, 'The content draft changed after its storage plan was prepared.');
}
export function cloneStorageKeys(body: EventContent, targetEventId: string) {
  return contentReferences(body).images.map((sourceKey) =>
    ({ sourceKey, key: `drafts/${targetEventId}/${randomUUID()}` }));
}
