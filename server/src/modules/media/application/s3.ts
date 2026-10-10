import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ERROR_CODES } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { AppError } from '../../../platform/errors/index.js';
import { logger } from '../../../platform/logger/index.js';

/**
 * Media storage.
 *
 * The file never passes through the API. The client asks for a presigned POST,
 * uploads straight to S3, and sends back the key — which keeps a multi-megabyte
 * phone photo off a request path sized for 100 KB of JSON, and off instances
 * whose job is answering booth taps.
 *
 * Three things are signed into the policy rather than trusted from the client:
 *
 *   the key         server-generated, so one volunteer cannot overwrite
 *                   another's photo by choosing a name
 *   the content type images only, so the bucket cannot be turned into a host
 *                   for arbitrary files
 *   the size        enforced by S3 itself, not merely checked here, so a
 *                   client that lies about `contentLength` still fails
 *
 * Reads are presigned per request rather than public. A permanent URL to an
 * item photo is findable long after the event by anyone who ever saw the link.
 */

const configured = Boolean(env.S3_MEDIA_BUCKET);

const client = configured ? new S3Client({ region: env.AWS_REGION }) : null;

if (!configured) {
  logger.warn(
    'S3_MEDIA_BUCKET is unset: photo uploads are disabled and will report MEDIA_NOT_CONFIGURED',
  );
}

export function mediaEnabled(): boolean {
  return configured;
}

function requireClient(): S3Client {
  if (!client || !env.S3_MEDIA_BUCKET) {
    throw new AppError(503, ERROR_CODES.MEDIA_NOT_CONFIGURED, {
      message: 'Photo upload is not available on this deployment. Record the item without one.',
      // Not a server fault — a deliberate deployment choice — so the message is
      // safe to show and tells the volunteer what to do instead.
      expose: true,
    });
  }
  return client;
}

/** Fails with MEDIA_NOT_CONFIGURED (503) when this deployment has no bucket. */
export function assertConfigured(): void {
  requireClient();
}

/** A presigned POST that S3 itself holds to the key, the type and the size. */
export async function presignUpload(input: {
  key: string;
  contentType: string;
  maxBytes: number;
  ttlSeconds: number;
}): Promise<{ url: string; fields: Record<string, string> }> {
  return createPresignedPost(requireClient(), {
    Bucket: env.S3_MEDIA_BUCKET as string,
    Key: input.key,
    Conditions: [
      // S3 enforces the ceiling regardless of what the client claimed.
      ['content-length-range', 1, input.maxBytes],
      ['eq', '$Content-Type', input.contentType],
    ],
    Fields: { 'Content-Type': input.contentType },
    Expires: input.ttlSeconds,
  });
}

/** A short-lived read URL for one object. */
export async function presignRead(key: string, ttlSeconds: number): Promise<string> {
  return getSignedUrl(
    requireClient(),
    new GetObjectCommand({
      Bucket: env.S3_MEDIA_BUCKET as string,
      Key: key,
      ResponseCacheControl: 'no-store',
    }),
    { expiresIn: ttlSeconds },
  );
}

/** Keys come only from this event's immutable issuance receipts and item references. */
export async function deleteMediaObject(key: string): Promise<void> {
  await requireClient().send(new DeleteObjectCommand({ Bucket: env.S3_MEDIA_BUCKET, Key: key }));
}
