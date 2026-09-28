import { randomUUID } from 'node:crypto';
import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { buildKey } from '../domain/mediaKeys.js';
import { assertConfigured, maxUploadBytes, presignUpload, uploadTtlSeconds } from './s3.js';

/**
 * Sign an upload policy. The file never passes through the API: the client
 * uploads straight to S3 with this policy and sends back the key.
 */
export async function createUpload(
  request: CreateUploadRequest,
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

  return { url, fields, key, expiresIn: uploadTtlSeconds(), maxBytes };
}
