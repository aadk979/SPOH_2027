import { randomUUID } from 'node:crypto';
import type { CreateContentImageRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import { insertImageReceipt, ownedImageReceipt } from '../data/repo.js';
import { prepareContentMutation, type ContentActor } from './prepare.js';
import { contentStorage } from './storage.js';

export function createContentImageUpload(request: CreateContentImageRequest, actor: ContentActor) {
  return prisma.$transaction(
    async (tx) => {
      const { scope, now } = await prepareContentMutation(tx, { actor, action: 'Content.Edit' });
      await lockReserved(tx, scope, request.idempotencyKey);
      const id = randomUUID();
      const key = `drafts/${scope.eventId}/${id}`;
      const signature = await contentStorage().issueImage({
        key,
        contentType: request.contentType,
        contentLength: request.contentLength,
      });
      await insertImageReceipt(scope, {
        tx,
        id,
        key,
        contentType: request.contentType,
        contentLength: request.contentLength,
        personId: actor.volunteerId,
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'content.image.issue',
        entityType: 'ContentUploadReceipt',
        entityId: id,
        after: { key, contentLength: request.contentLength, contentType: request.contentType },
      });
      const response = {
        data: { ...signature, key, expiresIn: 300, maxBytes: request.contentLength },
      };
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: { key },
      });
      return response;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}

/** Re-sign the same receipt after current permission checks; never retain signed credentials. */
export function replayContentImageUpload(input: {
  key: string;
  request: CreateContentImageRequest;
  actor: ContentActor;
}) {
  return prisma.$transaction(
    async (tx) => {
      const { scope } = await prepareContentMutation(tx, {
        actor: input.actor,
        action: 'Content.Edit',
      });
      const receipt = await ownedImageReceipt(scope, {
        tx,
        key: input.key,
        personId: input.actor.volunteerId,
      });
      if (!receipt) throw new NotFoundError('Content image');
      if (
        receipt.contentType !== input.request.contentType ||
        receipt.contentLength !== input.request.contentLength
      )
        throw new IdempotencyKeyReuseError();
      const signature = await contentStorage().issueImage(receipt);
      return {
        data: { ...signature, key: receipt.key, expiresIn: 300, maxBytes: receipt.contentLength },
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
