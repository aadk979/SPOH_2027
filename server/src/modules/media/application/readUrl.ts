import type { MediaUrlResponse } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { isReadableKey } from '../domain/mediaKeys.js';
import { assertConfigured, presignRead } from './s3.js';
import { mediaLimits } from './limits.js';

/** A short-lived read URL, only for a key this app could have issued. */
export async function readUrl(key: string, scope: EventScope): Promise<MediaUrlResponse> {
  assertConfigured();
  if (!isReadableKey(key)) throw new NotFoundError('Media object');
  const { ttlSeconds } = await mediaLimits(scope);
  return { url: await presignRead(key, ttlSeconds), expiresIn: ttlSeconds };
}
