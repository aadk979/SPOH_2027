import { randomUUID } from 'node:crypto';
import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { buildKey } from '../domain/mediaKeys.js';
import { assertConfigured, presignUpload } from './s3.js';
import { holdUploadAuthority, resolveUploadPolicy } from './uploadAdmission.js';

/**
 * Sign an upload policy. The file never passes through the API: the client
 * uploads straight to S3 with this policy and sends back the key.
 */
export async function createUpload(
  request: CreateUploadRequest,
  actor: ActorContext,
  clock: Clock = systemClock,
): Promise<CreateUploadResponse> {
  assertConfigured();
  return prisma.$transaction((tx) => issueUpload(tx, { request, actor, clock }), {
    isolationLevel: 'ReadCommitted',
    timeout: 30_000,
  });
}

/** Signing and its audit commit while event phase and current membership remain held. */
async function issueUpload(
  tx: PrismaTransactionClient,
  { request, actor, clock }: { request: CreateUploadRequest; actor: ActorContext; clock: Clock },
): Promise<CreateUploadResponse> {
  const { scope, audit } = actor;
  const event = await holdUploadAuthority(tx, actor);
  await lockReserved(tx, scope, request.idempotencyKey);
  const { now, maxBytes, ttlSeconds } = await resolveUploadPolicy(tx, {
    event,
    contentLength: request.contentLength,
    clock,
  });

  const key = buildKey(request, now, randomUUID());
  const { url, fields } = await presignUpload({
    key,
    contentType: request.contentType,
    maxBytes,
    ttlSeconds,
  });

  // Audited when the policy is issued: that is the moment someone was allowed
  // to put an object in the bucket, and the key is how to find it (F03-018).
  await writeAudit(tx, {
    ...audit,
    eventId: scope.eventId,
    action: 'media.upload',
    entityType: 'MediaObject',
    entityId: key,
    after: {
      purpose: request.purpose,
      contentType: request.contentType,
      contentLength: request.contentLength,
      rehearsal: event.status === 'REHEARSAL',
    },
  });
  await settleReserved(tx, scope, {
    key: request.idempotencyKey,
    statusCode: 201,
    body: { key },
  });

  return { url, fields, key, expiresIn: ttlSeconds, maxBytes };
}
