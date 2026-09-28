import { randomUUID } from 'node:crypto';
import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { buildKey } from '../domain/mediaKeys.js';
import { assertConfigured, maxUploadBytes, presignUpload, uploadTtlSeconds } from './s3.js';

/**
 * Sign an upload policy. The file never passes through the API: the client
 * uploads straight to S3 with this policy and sends back the key.
 */
export async function createUpload(
  request: CreateUploadRequest,
  { audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<CreateUploadResponse> {
  assertConfigured();
  const maxBytes = maxUploadBytes();

  if (request.contentLength > maxBytes) {
    throw new ValidationError('That photo is too large. Take a smaller one.', {
      field: 'contentLength',
      maxBytes,
    });
  }

  const key = buildKey(request, clock.now(), randomUUID());
  const { url, fields } = await presignUpload({
    key,
    contentType: request.contentType,
    maxBytes,
  });

  // Audited when the policy is issued: that is the moment someone was allowed
  // to put an object in the bucket, and the key is how to find it (F03-018).
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...audit,
      action: 'media.upload',
      entityType: 'MediaObject',
      entityId: key,
      after: { purpose: request.purpose, contentType: request.contentType },
    });
  });

  return { url, fields, key, expiresIn: uploadTtlSeconds(), maxBytes };
}
