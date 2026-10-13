import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { expect, it, vi } from 'vitest';
import { decodeS3Image, storeImmutableImage } from '../../src/platform/uploads/s3Image.js';
import { normalizeImage } from '../../src/platform/uploads/validatedImage.js';

async function fixture() {
  const body = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#1267ab' } }).png().toBuffer();
  const metadata = { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"', VersionId: 'source/version' };
  const send = vi.fn().mockResolvedValueOnce(metadata)
    .mockResolvedValueOnce({ ...metadata, Body: Readable.from([body]) });
  return { body, metadata, send, storage: { bucket: 'synthetic-bucket', client: { send } as unknown as S3Client } };
}
it('pins HEAD version and ETag in GET and stores only immutable fully decoded bytes', async () => {
  const f = await fixture();
  const decoded = await decodeS3Image(f.storage, { key: 'issued/key', maxBytes: 100_000,
    contentType: 'image/png', contentLength: f.body.length });
  expect(f.send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
  expect(f.send.mock.calls[1]![0]).toBeInstanceOf(GetObjectCommand);
  expect(f.send.mock.calls[1]![0].input).toEqual({ Bucket: 'synthetic-bucket', Key: 'issued/key',
    IfMatch: '"source"', VersionId: 'source/version' });
  expect(f.send.mock.calls.every((call) => call[1].abortSignal instanceof AbortSignal)).toBe(true);
  f.send.mockResolvedValueOnce({ VersionId: 'frozen/version' });
  expect(await storeImmutableImage(f.storage, 'validated/key', { image: decoded.image, cacheControl: 'no-store' }))
    .toBe('frozen/version');
  expect(f.send.mock.calls[2]![0]).toBeInstanceOf(PutObjectCommand);
  expect(f.send.mock.calls[2]![0].input).toMatchObject({ Key: 'validated/key', Body: decoded.image.body,
    IfNoneMatch: '*', ContentType: 'image/png', CacheControl: 'no-store', Metadata: { sha256: decoded.image.sha256 } });
});
it.each(['type', 'size', 'etag', 'version'] as const)('refuses changed source %s without any publication', async (field) => {
  const f = await fixture();
  f.send.mockReset().mockResolvedValueOnce(f.metadata).mockResolvedValueOnce({ ...f.metadata,
    ...(field === 'type' ? { ContentType: 'text/html' } : {}),
    ...(field === 'size' ? { ContentLength: f.body.length + 1 } : {}),
    ...(field === 'etag' ? { ETag: '"replacement"' } : {}),
    ...(field === 'version' ? { VersionId: 'other/version' } : {}), Body: Readable.from([f.body]) });
  await expect(decodeS3Image(f.storage, { key: 'key', maxBytes: 100_000 })).rejects.toMatchObject({ statusCode: 400 });
  expect(f.send).toHaveBeenCalledTimes(2);
});
it.each([{}, { ContentType: 'image/png', ContentLength: 5 },
  { ContentType: 'text/html', ContentLength: 5, ETag: '"source"' },
  { ContentType: 'image/png', ContentLength: 101, ETag: '"source"' }])('refuses incomplete or disallowed HEAD metadata', async (metadata) => {
  const f = await fixture(); f.send.mockReset().mockResolvedValueOnce(metadata);
  await expect(decodeS3Image(f.storage, { key: 'key', maxBytes: 100 })).rejects.toMatchObject({ statusCode: 400 });
  expect(f.send).toHaveBeenCalledTimes(1);
});
it('refuses short bytes and a checksum that differs from the committed published image receipt', async () => {
  const f = await fixture();
  f.send.mockReset().mockResolvedValueOnce(f.metadata)
    .mockResolvedValueOnce({ ...f.metadata, Body: Readable.from([f.body.subarray(0, 40)]) });
  await expect(decodeS3Image(f.storage, { key: 'key', maxBytes: 100_000 })).rejects.toMatchObject({ statusCode: 400 });
  f.send.mockReset().mockResolvedValueOnce(f.metadata).mockResolvedValueOnce({ ...f.metadata, Body: Readable.from([f.body]) });
  await expect(decodeS3Image(f.storage, { key: 'key', maxBytes: 100_000,
    proof: { contentType: 'image/png', contentLength: f.body.length, sha256: 'a'.repeat(64), objectVersionId: 'source/version' } }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(f.send.mock.calls[0]![0].input.VersionId).toBe('source/version');
});
it('reconciles a SQL-rollback retry only when the existing immutable derivative has the exact normalized digest', async () => {
  const f = await fixture();
  const image = await normalizeImage({ body: f.body, contentType: 'image/png', maxBytes: 100_000 });
  const metadata = { ...f.metadata, ContentLength: image.body.length, VersionId: 'frozen/version' };
  f.send.mockReset().mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } })
    .mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, Body: Readable.from([image.body]) });
  expect(await storeImmutableImage(f.storage, 'validated/key', { image, cacheControl: 'no-store' })).toBe('frozen/version');
  expect(createHash('sha256').update(image.body).digest('hex')).toBe(image.sha256);
  f.send.mockReset().mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } })
    .mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, Body: Readable.from([image.body]) });
  await expect(storeImmutableImage(f.storage, 'validated/key',
    { image: { ...image, sha256: 'a'.repeat(64) }, cacheControl: 'no-store' })).rejects.toMatchObject({ statusCode: 400 });
});
it('propagates storage outage and conditional-write conflicts other than an existing object', async () => {
  const f = await fixture();
  const image = await normalizeImage({ body: f.body, contentType: 'image/png', maxBytes: 100_000 });
  const outage = new Error('synthetic outage'); f.send.mockReset().mockRejectedValueOnce(outage);
  await expect(storeImmutableImage(f.storage, 'validated/key', { image, cacheControl: 'no-store' })).rejects.toBe(outage);
  expect(f.send).toHaveBeenCalledTimes(1);
});
