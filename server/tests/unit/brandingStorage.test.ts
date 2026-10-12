import { beforeEach, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn(async (_client: unknown, _input: unknown) => ({ url: 'https://upload.example.test', fields: { policy: 'synthetic' } })));
vi.mock('../../src/config/env.js', () => ({ env: { S3_CONTENT_BUCKET: 'synthetic-content', AWS_REGION: 'ap-southeast-1' } }));
vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  return { ...actual, S3Client: class { send = send; } };
});
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: post }));
import { brandingStorage, imageDigest } from '../../src/modules/branding/application/storage.js';
const bytes = Uint8Array.from([137, 80, 78, 71]);
const receipt = { key: 'drafts/event/branding/receipt', contentType: 'image/png', contentLength: 4 };
beforeEach(() => { send.mockReset(); post.mockClear(); });
it('pins upload reads to the exact head version and ETag before normalization', async () => {
  send.mockResolvedValueOnce({ ContentLength: 4, ContentType: 'image/png', ETag: 'exact-etag', VersionId: 'immutable-version' });
  send.mockResolvedValueOnce({ ContentLength: 4, ContentType: 'image/png', Body: { transformToByteArray: async () => bytes } });
  expect(await brandingStorage().uploaded(receipt)).toEqual(bytes);
  expect(send.mock.calls[1]![0].input).toMatchObject({ Key: receipt.key, VersionId: 'immutable-version', IfMatch: 'exact-etag' });
});
it('refuses changed upload declarations and never reads their body', async () => {
  send.mockResolvedValueOnce({ ContentLength: 5, ContentType: 'image/png', ETag: 'changed' });
  await expect(brandingStorage().uploaded(receipt)).rejects.toThrow('changed');
  expect(send).toHaveBeenCalledTimes(1);
});
it('uses exact upload constraints without allowing an arbitrary MIME or size at S3', async () => {
  await brandingStorage().issue(receipt);
  expect(post.mock.calls[0]![1]).toMatchObject({ Key: receipt.key, Expires: 300, Conditions: [['content-length-range', 4, 4], ['eq', '$Content-Type', 'image/png']] });
});
it('writes approved variants conditionally and retains the exact version, digest and byte count', async () => {
  send.mockResolvedValueOnce({ VersionId: 'saved-version' });
  const assets = await brandingStorage().put({ prefix: 'content/event/branding/publication', images: [{ variant: 'logo', body: bytes }] });
  expect(send.mock.calls[0]![0].input).toMatchObject({ Key: 'content/event/branding/publication/logo.png', IfNoneMatch: '*', ContentType: 'image/png' });
  expect(assets[0]).toMatchObject({ versionId: 'saved-version', sha256: imageDigest(bytes), bytes: 4 });
  send.mockRejectedValueOnce(new Error('PreconditionFailed'));
  await expect(brandingStorage().put({ prefix: 'content/event/branding/conflict', images: [{ variant: 'logo', body: bytes }] })).rejects.toThrow('PreconditionFailed');
  expect(send).toHaveBeenCalledTimes(2);
});
it('verifies MIME, exact length and digest before returning a saved logo', async () => {
  const asset = { variant: 'logo' as const, key: 'content/event/branding/publication/logo.png', versionId: 'saved-version', bytes: 4, sha256: imageDigest(bytes) };
  send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4, Body: { transformToByteArray: async () => bytes } });
  expect(await brandingStorage().read(asset)).toEqual(bytes);
  expect(send.mock.calls[0]![0].input).toMatchObject({ VersionId: 'saved-version' });
  send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4, Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3, 4]) } });
  await expect(brandingStorage().read(asset)).rejects.toThrow('changed');
  send.mockResolvedValueOnce({ ContentType: 'text/html', ContentLength: 4 });
  await expect(brandingStorage().read(asset)).rejects.toThrow('changed');
});
it.each([
  { ContentLength: 4, ContentType: 'image/png' },
  { ContentLength: 4, ContentType: 'text/html', ETag: 'etag' },
])('refuses unverifiable upload identity before downloading bytes', async (head) => {
  send.mockResolvedValueOnce(head);
  await expect(brandingStorage().uploaded(receipt)).rejects.toThrow('changed');
  expect(send).toHaveBeenCalledTimes(1);
});
it.each([
  { ContentLength: 4, ContentType: 'image/png' },
  { ContentLength: 5, ContentType: 'image/png', Body: { transformToByteArray: async () => bytes } },
  { ContentLength: 4, ContentType: 'text/html', Body: { transformToByteArray: async () => bytes } },
  { ContentLength: 4, ContentType: 'image/png', Body: { transformToByteArray: async () => bytes.subarray(0, 3) } },
])('refuses changed or missing download bytes after a valid HEAD', async (object) => {
  send.mockResolvedValueOnce({ ContentLength: 4, ContentType: 'image/png', ETag: 'etag' });
  send.mockResolvedValueOnce(object);
  await expect(brandingStorage().uploaded(receipt)).rejects.toThrow('changed');
  expect(send.mock.calls[1]![0].input).toMatchObject({ IfMatch: 'etag' });
  expect(send.mock.calls[1]![0].input).not.toHaveProperty('VersionId');
});
it('retains conditional writes and digest validation when the storage has no version identifier', async () => {
  send.mockResolvedValueOnce({});
  const [asset] = await brandingStorage().put({ prefix: 'content/event/branding/publication', images: [{ variant: 'logo', body: bytes }] });
  expect(asset).toMatchObject({ versionId: null, sha256: imageDigest(bytes), bytes: 4 });
  send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4, Body: { transformToByteArray: async () => bytes } });
  expect(await brandingStorage().read(asset!)).toEqual(bytes);
  expect(send.mock.calls[1]![0].input).not.toHaveProperty('VersionId');
  send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4 });
  await expect(brandingStorage().read(asset!)).rejects.toThrow('changed');
  send.mockResolvedValueOnce({ ContentType: 'image/png', ContentLength: 4, Body: { transformToByteArray: async () => bytes.subarray(0, 3) } });
  await expect(brandingStorage().read(asset!)).rejects.toThrow('changed');
});
