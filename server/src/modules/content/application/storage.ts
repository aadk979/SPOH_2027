import { createHash } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { ERROR_CODES, UploadContentType, type EventContent } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { AppError, ValidationError } from '../../../platform/errors/index.js';
import {
  CONTENT_BUDGET_BYTES,
  frozenContent,
  publicationImageKey,
} from '../domain/contentRules.js';
import {
  decodeS3Image,
  storeImmutableImage,
  type ImageProof,
  type DecodedObject,
} from '../../../platform/uploads/s3Image.js';
import { boundedBytes } from '../../../platform/uploads/boundedBytes.js';
import { normalizeImage } from '../../../platform/uploads/validatedImage.js';
import type { ImageManifestEntry } from '../domain/imageManifest.js';

export interface ContentImageReceipt {
  key: string;
  contentType: string;
  contentLength: number;
}
export interface FrozenPublication {
  body: EventContent;
  objectKey: string;
  etag: string;
  imageManifest?: ImageManifestEntry[];
}
export interface ContentStorage {
  issueImage(input: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; fields: Record<string, string> }>;
  publish(input: {
    eventId: string;
    id: string;
    body: EventContent;
    images: readonly ContentImageReceipt[];
  }): Promise<FrozenPublication>;
  read(key: string, receipt?: ImageProof): Promise<{ body: Uint8Array; contentType: string }>;
  copyImage(input: {
    sourceKey: string;
    key: string;
    receipt?: ImageProof;
  }): Promise<ContentImageReceipt>;
  deleteObject?(key: string): Promise<void>;
}
const requireStorage = () => {
  if (!env.S3_CONTENT_BUCKET)
    throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, {
      message: 'Content storage is not configured. Contact the platform administrator.',
      expose: true,
    });
  return { client: new S3Client({ region: env.AWS_REGION }), bucket: env.S3_CONTENT_BUCKET };
};
async function servedBytes(
  body: Buffer,
  contentType: string | undefined,
  input: { key: string; validated: boolean },
) {
  const imageType = UploadContentType.safeParse(contentType);
  if (imageType.success && !input.validated) {
    const normalized = await normalizeImage({
      body,
      contentType: imageType.data,
      maxBytes: 1024 * 1024,
    });
    return { body: normalized.body, contentType: normalized.contentType };
  }
  if (!input.key.endsWith('.json') && !imageType.success)
    throw new ValidationError('Published image type is invalid.');
  return { body, contentType: contentType ?? 'application/json' };
}
async function freezeImages(input: {
  eventId: string;
  id: string;
  images: readonly ContentImageReceipt[];
}) {
  const { client, bucket } = requireStorage();
  const paths = new Map<string, string>();
  const decodedImages: Array<{ key: string; decoded: DecodedObject }> = [];
  let bytes = 0;
  for (const [index, image] of input.images.entries()) {
    const decoded = await decodeS3Image({ client, bucket }, { ...image, maxBytes: 1024 * 1024 });
    bytes += decoded.image.contentLength;
    if (bytes > CONTENT_BUDGET_BYTES)
      throw new ValidationError('The published guide and floor plans must fit within 2 MB.');
    const key = publicationImageKey(input.eventId, input.id, index);
    decodedImages.push({ key, decoded });
    paths.set(image.key, key);
  }
  return { paths, bytes, decodedImages };
}
async function storePublicationImages(images: Array<{ key: string; decoded: DecodedObject }>) {
  const storage = requireStorage();
  const manifest: ImageManifestEntry[] = [];
  for (const { key, decoded } of images) {
    const objectVersionId = await storeImmutableImage(storage, key, {
      image: decoded.image,
      cacheControl: 'public, max-age=31536000, immutable',
    });
    manifest.push({
      schemaVersion: 1,
      key,
      contentType: decoded.image.contentType,
      contentLength: decoded.image.contentLength,
      sha256: decoded.image.sha256,
      sourceEtag: decoded.sourceEtag,
      sourceVersionId: decoded.sourceVersionId,
      objectVersionId,
    });
  }
  return manifest;
}
function missingStorageObject(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'NotFound' || error.name === 'NoSuchKey')
  );
}
function forbiddenStorageHead(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata &&
    error.$metadata.httpStatusCode === 403
  );
}
async function absentExactKey(
  storage: { client: S3Client; bucket: string },
  key: string,
  abortSignal: AbortSignal,
): Promise<boolean> {
  // A conditioned one-result list distinguishes absent keys from genuine HEAD denial.
  const { client, bucket } = storage;
  const found = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: key, MaxKeys: 1 }),
    { abortSignal },
  );
  return !(found.Contents ?? []).some((object) => object.Key === key);
}
const s3Content: ContentStorage = {
  async deleteObject(key) {
    const { client, bucket } = requireStorage();
    const abortSignal = AbortSignal.timeout(2000);
    try {
      const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal,
      });
      if (!object.VersionId)
        throw new ValidationError('Content cleanup requires the configured versioned bucket.');
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: object.VersionId }),
        { abortSignal },
      );
    } catch (error) {
      if (missingStorageObject(error)) return;
      if (
        forbiddenStorageHead(error) &&
        (await absentExactKey({ client, bucket }, key, abortSignal))
      )
        return;
      throw error;
    }
  },
  async copyImage(input) {
    const { client, bucket } = requireStorage();
    const decoded = await decodeS3Image(
      { client, bucket },
      {
        key: input.sourceKey,
        maxBytes: 1024 * 1024,
        ...(input.receipt ? { proof: input.receipt } : {}),
      },
    );
    await storeImmutableImage({ client, bucket }, input.key, {
      image: decoded.image,
      cacheControl: 'no-store',
    });
    return {
      key: input.key,
      contentType: decoded.image.contentType,
      contentLength: decoded.image.contentLength,
    };
  },
  async issueImage(input) {
    const { client, bucket } = requireStorage();
    return createPresignedPost(client, {
      Bucket: bucket,
      Key: input.key,
      Conditions: [
        ['content-length-range', input.contentLength, input.contentLength],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: { 'Content-Type': input.contentType },
      Expires: 300,
    });
  },
  async publish(input) {
    const { client, bucket } = requireStorage();
    const { paths, bytes, decodedImages } = await freezeImages(input);
    const body = frozenContent(input.body, paths);
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) + bytes > CONTENT_BUDGET_BYTES)
      throw new ValidationError('The published guide and floor plans must fit within 2 MB.');
    const manifest = await storePublicationImages(decodedImages);
    const objectKey = `content/${input.eventId}/${input.id}.json`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: json,
        IfNoneMatch: '*',
        ContentType: 'application/json',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    return {
      body,
      objectKey,
      etag: `"${createHash('sha256').update(json).digest('hex')}"`,
      imageManifest: manifest,
    };
  },
  async read(key, receipt) {
    const { client, bucket } = requireStorage();
    const abortSignal = AbortSignal.timeout(10_000);
    const object = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(receipt?.objectVersionId ? { VersionId: receipt.objectVersionId } : {}),
      }),
      { abortSignal },
    );
    if (!object.Body) throw new ValidationError('Published content is unavailable.');
    const body = await boundedBytes(object.Body, CONTENT_BUDGET_BYTES, abortSignal);
    if (
      receipt &&
      (body.length !== receipt.contentLength ||
        createHash('sha256').update(body).digest('hex') !== receipt.sha256)
    )
      throw new ValidationError('The published image does not match its validated receipt.');
    return servedBytes(body, receipt?.contentType ?? object.ContentType, {
      key,
      validated: receipt !== undefined,
    });
  },
};
let activeStorage: ContentStorage = s3Content;
export const contentStorage = (): ContentStorage => activeStorage;
/** Scoped adapters let application tests prove rollback without a cloud dependency. */
export function useContentStorage(storage: ContentStorage): () => void {
  const previous = activeStorage;
  activeStorage = storage;
  return () => {
    activeStorage = previous;
  };
}
