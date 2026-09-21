import { randomUUID } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  ERROR_CODES,
  type CreateUploadRequest,
  type CreateUploadResponse,
  type MediaUrlResponse,
  type UploadPurpose,
} from '@spoh/shared';
import { env } from '../../config/env.js';
import { AppError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

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
    throw new AppError(
      503,
      ERROR_CODES.MEDIA_NOT_CONFIGURED,
      'Photo upload is not available on this deployment. Record the item without one.',
      // Not a server fault — a deliberate deployment choice — so the message is
      // safe to show and tells the volunteer what to do instead.
      { expose: true },
    );
  }
  return client;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Where each purpose stores its objects. Date-partitioned, for lifecycle rules. */
const PREFIXES: Record<UploadPurpose, string> = {
  lostFound: 'lost-found',
};

/**
 * Keys are generated, never accepted.
 *
 * Date-partitioned so the bucket's lifecycle policy can expire a whole event's
 * photos, and random within the day so a key cannot be guessed from knowing
 * when an item was logged.
 */
function buildKey(purpose: UploadPurpose, contentType: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  return `${PREFIXES[purpose]}/${year}/${month}/${day}/${randomUUID()}.${EXTENSIONS[contentType]}`;
}

export async function createUpload(request: CreateUploadRequest): Promise<CreateUploadResponse> {
  const s3 = requireClient();
  const bucket = env.S3_MEDIA_BUCKET as string;
  const maxBytes = env.S3_MAX_UPLOAD_BYTES;

  if (request.contentLength > maxBytes) {
    throw new ValidationError('That photo is too large. Take a smaller one.', {
      field: 'contentLength',
      maxBytes,
    });
  }

  const key = buildKey(request.purpose, request.contentType);

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Conditions: [
      // S3 enforces the ceiling regardless of what the client claimed.
      ['content-length-range', 1, maxBytes],
      ['eq', '$Content-Type', request.contentType],
    ],
    Fields: { 'Content-Type': request.contentType },
    Expires: env.S3_UPLOAD_TTL_SECONDS,
  });

  return {
    url,
    fields,
    key,
    expiresIn: env.S3_UPLOAD_TTL_SECONDS,
    maxBytes,
  };
}

/**
 * A short-lived read URL.
 *
 * The key is validated against the known prefixes before it is signed. Without
 * that, this endpoint would sign a URL for any object in the bucket for any
 * caller who could guess a key — including anything else that ever lands there.
 */
export async function readUrl(key: string): Promise<MediaUrlResponse> {
  const s3 = requireClient();

  const allowed = Object.values(PREFIXES).some((prefix) => key.startsWith(`${prefix}/`));
  if (!allowed || key.includes('..')) throw new NotFoundError('Media object');

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.S3_MEDIA_BUCKET as string, Key: key }),
    { expiresIn: env.S3_UPLOAD_TTL_SECONDS },
  );

  return { url, expiresIn: env.S3_UPLOAD_TTL_SECONDS };
}
