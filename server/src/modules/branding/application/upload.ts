import { randomUUID } from 'node:crypto';
import type { BrandingUploadRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import { insertUpload, ownedUpload } from '../data/repo.js';
import { prepareBranding, type BrandingActor } from './prepare.js';
import { brandingStorage } from './storage.js';

export function issueBrandingUpload(request: BrandingUploadRequest, actor: BrandingActor) {
  return prisma.$transaction(async (tx) => {
    const { now } = await prepareBranding(tx, { actor, action: 'Content.Edit', expectedVersion: request.expectedVersion });
    await lockReserved(tx, actor.scope, request.idempotencyKey);
    const id = randomUUID();
    const key = `drafts/${actor.scope.eventId}/branding/${id}`;
    const signature = await brandingStorage().issue({ key, ...request });
    await insertUpload(actor.scope, { tx, id, key, contentType: request.contentType, contentLength: request.contentLength, personId: actor.volunteerId, now });
    await writeAudit(tx, { ...actor.audit, action: 'branding.image.issue', entityType: 'ContentUploadReceipt', entityId: id, after: { bytes: request.contentLength, type: request.contentType } });
    await settleReserved(tx, actor.scope, { key: request.idempotencyKey, statusCode: 201, body: { receiptId: id } });
    return { data: { receiptId: id, ...signature, expiresIn: 300 as const, maxBytes: request.contentLength } };
  }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
}
export function replayBrandingUpload(input: { receiptId: string; request: BrandingUploadRequest; actor: BrandingActor }) {
  return prisma.$transaction(async (tx) => {
    const { actor, request } = input;
    await prepareBranding(tx, { actor, action: 'Content.Edit', expectedVersion: request.expectedVersion });
    const receipt = await ownedUpload(actor.scope, { tx, id: input.receiptId, personId: actor.volunteerId });
    if (!receipt || receipt.key !== `drafts/${actor.scope.eventId}/branding/${input.receiptId}`) throw new NotFoundError('Logo upload');
    if (receipt.contentType !== request.contentType || receipt.contentLength !== request.contentLength) throw new IdempotencyKeyReuseError();
    return { data: { receiptId: receipt.id, ...await brandingStorage().issue(receipt), expiresIn: 300 as const, maxBytes: receipt.contentLength } };
  }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
}
