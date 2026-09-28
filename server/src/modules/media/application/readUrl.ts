import type { MediaUrlResponse } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { isReadableKey } from '../domain/mediaKeys.js';
import { assertConfigured, presignRead, uploadTtlSeconds } from './s3.js';

/** A short-lived read URL, only for a key this app could have issued. */
export async function readUrl(key: string): Promise<MediaUrlResponse> {
  assertConfigured();
  if (!isReadableKey(key)) throw new NotFoundError('Media object');
  return { url: await presignRead(key), expiresIn: uploadTtlSeconds() };
}
