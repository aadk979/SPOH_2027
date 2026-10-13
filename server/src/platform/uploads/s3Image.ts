import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type HeadObjectCommandOutput,
  type GetObjectCommandOutput, type S3Client } from '@aws-sdk/client-s3';
import { UploadContentType } from '@spoh/shared';
import { createHash } from 'node:crypto';
import { ValidationError } from '../errors/index.js';
import { boundedBytes } from './boundedBytes.js';
import { normalizeImage, type ValidatedImage } from './validatedImage.js';

export interface ImageStorage { client: S3Client; bucket: string }
export interface ImageProof {
  contentType: string; contentLength: number; sha256: string; objectVersionId: string | null;
}
export interface ImageIntent {
  key: string; contentType?: string; contentLength?: number; maxBytes: number; proof?: ImageProof;
}
export interface DecodedObject {
  image: ValidatedImage; sourceEtag: string; sourceVersionId: string | null;
}

function checkedMetadata(object: HeadObjectCommandOutput, intent: ImageIntent) {
  const type = UploadContentType.safeParse(object.ContentType);
  if (!type.success || !object.ETag || !object.ContentLength || object.ContentLength > intent.maxBytes)
    throw new ValidationError('An image upload is incomplete or changed. Upload it again.');
  if ((intent.contentType !== undefined && object.ContentType !== intent.contentType) ||
    (intent.contentLength !== undefined && object.ContentLength !== intent.contentLength))
    throw new ValidationError('The uploaded image does not match its issued intent.');
  return { type: type.data, etag: object.ETag, length: object.ContentLength, versionId: object.VersionId ?? null };
}
function assertSameSource(source: GetObjectCommandOutput, metadata: ReturnType<typeof checkedMetadata>) {
  if (source.ETag !== metadata.etag || source.ContentLength !== metadata.length || source.ContentType !== metadata.type)
    throw new ValidationError('The image changed while it was being validated.');
  if (metadata.versionId && source.VersionId !== metadata.versionId)
    throw new ValidationError('The image version changed while it was being validated.');
}
function pinnedHead(storage: ImageStorage, intent: ImageIntent) {
  return new HeadObjectCommand({ Bucket: storage.bucket, Key: intent.key,
    ...(intent.proof?.objectVersionId ? { VersionId: intent.proof.objectVersionId } : {}) });
}
function issuedIntent(intent: ImageIntent) {
  return { ...intent, contentType: intent.proof?.contentType ?? intent.contentType,
    contentLength: intent.proof?.contentLength ?? intent.contentLength };
}
function assertProof(metadata: ReturnType<typeof checkedMetadata>, proof?: ImageProof) {
  if (proof?.objectVersionId && metadata.versionId !== proof.objectVersionId)
    throw new ValidationError('The published image version does not match its validated receipt.');
}
function assertDecodedBytes(body: Buffer, metadata: ReturnType<typeof checkedMetadata>, proof?: ImageProof) {
  if (body.length !== metadata.length) throw new ValidationError('The image upload is incomplete.');
  if (proof && createHash('sha256').update(body).digest('hex') !== proof.sha256)
    throw new ValidationError('The published image does not match its validated receipt.');
}

/** Pin exactly the version or ETag whose bounded bytes are fully decoded. */
export async function decodeS3Image(storage: ImageStorage, intent: ImageIntent): Promise<DecodedObject> {
  const timeout = { abortSignal: AbortSignal.timeout(10_000) };
  const object = await storage.client.send(pinnedHead(storage, intent), timeout);
  const metadata = checkedMetadata(object, issuedIntent(intent));
  assertProof(metadata, intent.proof);
  const source = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: intent.key,
    IfMatch: metadata.etag, ...(metadata.versionId ? { VersionId: metadata.versionId } : {}) }), timeout);
  assertSameSource(source, metadata);
  const body = await boundedBytes(source.Body, intent.maxBytes, timeout.abortSignal);
  assertDecodedBytes(body, metadata, intent.proof);
  return { image: await normalizeImage({ body, contentType: metadata.type, maxBytes: intent.maxBytes }),
    sourceEtag: metadata.etag, sourceVersionId: metadata.versionId };
}

export async function storeImmutableImage(storage: ImageStorage, key: string,
  input: { image: ValidatedImage; cacheControl: string }): Promise<string | null> {
  try {
    const response = await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key,
      Body: input.image.body, IfNoneMatch: '*', ContentType: input.image.contentType,
      ContentDisposition: 'inline', CacheControl: input.cacheControl, Metadata: { sha256: input.image.sha256 } }),
      { abortSignal: AbortSignal.timeout(10_000) });
    return response.VersionId ?? null;
  } catch (error) {
    if (!isExistingObject(error)) throw error;
    const existing = await decodeS3Image(storage, { key, maxBytes: input.image.contentLength,
      proof: { ...input.image, objectVersionId: null } });
    return existing.sourceVersionId;
  }
}

function isExistingObject(error: unknown): boolean {
  return typeof error === 'object' && error !== null && '$metadata' in error &&
    typeof error.$metadata === 'object' && error.$metadata !== null &&
    'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 412;
}
