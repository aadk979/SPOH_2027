import { createHash } from 'node:crypto';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

export interface ContentImageReceipt {
  key: string;
  contentType: string;
  contentLength: number;
}
export interface FrozenPublication {
  body: EventContent;
  objectKey: string;
  etag: string;
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
  read(key: string): Promise<{ body: Uint8Array; contentType: string }>;
  copyImage(input: { sourceKey: string; key: string }): Promise<ContentImageReceipt>;
}
const requireStorage = () => {
  if (!env.S3_CONTENT_BUCKET)
    throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, {
      message: 'Content storage is not configured. Contact the platform administrator.',
      expose: true,
    });
  return { client: new S3Client({ region: env.AWS_REGION }), bucket: env.S3_CONTENT_BUCKET };
};
async function freezeImages(input: {
  eventId: string;
  id: string;
  images: readonly ContentImageReceipt[];
}) {
  const { client, bucket } = requireStorage();
  const paths = new Map<string, string>();
  let bytes = 0;
  for (const [index, image] of input.images.entries()) {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: image.key }));
    if (
      object.ContentType !== image.contentType ||
      object.ContentLength !== image.contentLength ||
      !object.ETag
    )
      throw new ValidationError(
        'An image upload is incomplete or changed. Upload it again before publishing.',
      );
    bytes += object.ContentLength;
    if (bytes > CONTENT_BUDGET_BYTES)
      throw new ValidationError('The published guide and floor plans must fit within 2 MB.');
    const key = publicationImageKey(input.eventId, input.id, index);
    const source = `${bucket}/${image.key.split('/').map(encodeURIComponent).join('/')}`;
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: object.VersionId
          ? `${source}?versionId=${encodeURIComponent(object.VersionId)}`
          : source,
        CopySourceIfMatch: object.ETag,
        ContentType: image.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
        MetadataDirective: 'REPLACE',
      }),
    );
    paths.set(image.key, key);
  }
  return { paths, bytes };
}
const s3Content: ContentStorage = {
  async copyImage(input) {
    const { client, bucket } = requireStorage();
    const object = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: input.sourceKey }),
    );
    const contentType = UploadContentType.parse(object.ContentType);
    if (!object.ETag || !object.ContentLength || object.ContentLength > 1024 * 1024)
      throw new ValidationError('A published floor plan is unavailable or too large to copy.');
    const source = `${bucket}/${input.sourceKey.split('/').map(encodeURIComponent).join('/')}`;
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: input.key,
        CopySource: object.VersionId
          ? `${source}?versionId=${encodeURIComponent(object.VersionId)}`
          : source,
        CopySourceIfMatch: object.ETag,
        ContentType: contentType,
        CacheControl: 'no-store',
        MetadataDirective: 'REPLACE',
      }),
    );
    return { key: input.key, contentType, contentLength: object.ContentLength };
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
    const { paths, bytes } = await freezeImages(input);
    const body = frozenContent(input.body, paths);
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) + bytes > CONTENT_BUDGET_BYTES)
      throw new ValidationError('The published guide and floor plans must fit within 2 MB.');
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
    );
    return { body, objectKey, etag: `"${createHash('sha256').update(json).digest('hex')}"` };
  },
  async read(key) {
    const { client, bucket } = requireStorage();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new ValidationError('Published content is unavailable.');
    return {
      body: await object.Body.transformToByteArray(),
      contentType: object.ContentType ?? 'application/octet-stream',
    };
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
