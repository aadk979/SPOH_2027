import { createHash } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { ERROR_CODES } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { AppError, ValidationError } from '../../../platform/errors/index.js';
import type { AssetSet, StoredAsset } from '../domain/registry.js';
import type { NormalizedImages } from './images.js';

export interface BrandingStorage {
  issue(input: { key: string; contentType: string; contentLength: number }): Promise<{ url: string; fields: Record<string, string> }>;
  uploaded(input: { key: string; contentType: string; contentLength: number }): Promise<Uint8Array>;
  put(input: { prefix: string; images: NormalizedImages }): Promise<AssetSet>;
  read(asset: StoredAsset): Promise<Uint8Array>;
}
export const imageDigest = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
function configured() {
  if (!env.S3_CONTENT_BUCKET) throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, { message: 'Logo storage is unavailable. Contact the platform administrator.', expose: true });
  return { client: new S3Client({ region: env.AWS_REGION }), bucket: env.S3_CONTENT_BUCKET };
}
const s3Branding: BrandingStorage = {
  async issue(input) {
    const { client, bucket } = configured();
    return createPresignedPost(client, { Bucket: bucket, Key: input.key, Fields: { 'Content-Type': input.contentType }, Conditions: [['content-length-range', input.contentLength, input.contentLength], ['eq', '$Content-Type', input.contentType]], Expires: 300 });
  },
  async uploaded(input) {
    const { client, bucket } = configured();
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
    if (head.ContentLength !== input.contentLength || head.ContentType !== input.contentType || !head.ETag) throw unavailable();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: input.key, ...(head.VersionId ? { VersionId: head.VersionId } : {}), IfMatch: head.ETag }));
    if (!object.Body || object.ContentLength !== input.contentLength || object.ContentType !== input.contentType) throw unavailable();
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length !== input.contentLength) throw unavailable();
    return bytes;
  },
  async put(input) {
    const { client, bucket } = configured();
    const assets: AssetSet = [];
    for (const image of input.images) {
      const key = `${input.prefix}/${image.variant}.png`;
      const result = await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: image.body, ContentType: 'image/png', IfNoneMatch: '*', CacheControl: 'public, max-age=31536000, immutable' }));
      assets.push({ variant: image.variant, key, versionId: result.VersionId ?? null, sha256: imageDigest(image.body), bytes: image.body.length });
    }
    return assets;
  },
  async read(asset) {
    const { client, bucket } = configured();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: asset.key, ...(asset.versionId ? { VersionId: asset.versionId } : {}) }));
    if (!object.Body || object.ContentType !== 'image/png' || object.ContentLength !== asset.bytes) throw unavailable();
    const body = await object.Body.transformToByteArray();
    if (body.length !== asset.bytes || imageDigest(body) !== asset.sha256) throw unavailable();
    return body;
  },
};
const unavailable = () => new ValidationError('The saved logo is missing or changed. Upload it again.');
let active: BrandingStorage = s3Branding;
export const brandingStorage = () => active;
export function useBrandingStorage(storage: BrandingStorage): () => void {
  const previous = active;
  active = storage;
  return () => { active = previous; };
}
