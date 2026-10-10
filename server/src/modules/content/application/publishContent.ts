import { randomUUID } from 'node:crypto';
import { ERROR_CODES, EventContent, type PublishContentRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { toPublishedContent } from '../data/mappers.js';
import { insertContentVersion } from '../data/repo.js';
import {
  checkedContentDraft,
  prepareContentMutation,
  validateContentReferences,
  type ContentActor,
} from './prepare.js';
import { contentStorage } from './storage.js';

/** Uploads become reachable only when the immutable DB publication and audit commit. */
export async function publishContentInTransaction(
  tx: PrismaTransactionClient,
  input: { actor: ContentActor; expectedVersion: number },
) {
  const { actor } = input;
  const { scope, now } = await prepareContentMutation(tx, { actor, action: 'Content.Publish' });
  const draft = await checkedContentDraft(tx, input);
  if (draft.reviewedVersion !== draft.version)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Review this draft version before publishing it.',
    );
  const body = EventContent.parse(draft.body);
  const images = await validateContentReferences(tx, { actor, body });
  const id = randomUUID();
  const frozen = await contentStorage().publish({ eventId: scope.eventId, id, body, images });
  const row = await insertContentVersion(scope, {
    tx,
    id,
    draftVersion: draft.version,
    ...frozen,
    personId: actor.volunteerId,
    now,
  });
  await writeAudit(tx, {
    ...actor.audit,
    action: 'content.publish',
    entityType: 'ContentVersion',
    entityId: row.id,
    after: { version: row.version, draftVersion: row.draftVersion, objectKey: row.objectKey },
  });
  return { data: toPublishedContent(row) };
}
export function publishContent(request: PublishContentRequest, actor: ContentActor) {
  return prisma.$transaction(
    async (tx) => {
      await prepareContentMutation(tx, { actor, action: 'Content.Publish' });
      await lockReserved(tx, actor.scope, request.idempotencyKey);
      const response = await publishContentInTransaction(tx, {
        actor,
        expectedVersion: request.expectedVersion,
      });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 200,
        body: response,
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
