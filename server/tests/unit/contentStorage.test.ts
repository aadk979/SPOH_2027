import { beforeEach, expect, it, vi } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { contentStorage } from '../../src/modules/content/application/storage.js';
import { archiveStorage } from '../../src/modules/report/application/archiveStorage.js';
import { guideContent } from '../helpers/content.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  post: vi.fn(),
  env: {
    AWS_REGION: 'ap-southeast-1',
    S3_CONTENT_BUCKET: 'content-test' as string | undefined,
    S3_EXPORTS_BUCKET: 'exports-test' as string | undefined,
  },
}));
vi.mock('../../src/config/env.js', () => ({ env: mocks.env }));
vi.mock('@aws-sdk/client-s3', async (importActual) => ({
  ...(await importActual<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = mocks.send;
  },
}));
vi.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: mocks.post }));
const input = () => ({
  eventId: 'event',
  id: 'version',
  body: guideContent(),
  images: [] as Array<{ key: string; contentType: string; contentLength: number }>,
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.S3_CONTENT_BUCKET = 'content-test';
  mocks.env.S3_EXPORTS_BUCKET = 'exports-test';
  mocks.post.mockResolvedValue({ url: 'https://upload.test', fields: { policy: 'signed' } });
});

it('constrains the signed POST to exact content type, size and five-minute lifetime', async () => {
  await contentStorage().issueImage({
    key: 'drafts/event/image',
    contentType: 'image/png',
    contentLength: 123,
  });
  expect(mocks.post.mock.calls[0]![1]).toMatchObject({
    Bucket: 'content-test',
    Key: 'drafts/event/image',
    Expires: 300,
    Conditions: [
      ['content-length-range', 123, 123],
      ['eq', '$Content-Type', 'image/png'],
    ],
  });
});
it('fails closed if content or export storage is absent', async () => {
  mocks.env.S3_CONTENT_BUCKET = undefined;
  mocks.env.S3_EXPORTS_BUCKET = undefined;
  await expect(
    contentStorage().issueImage({ key: 'a', contentType: 'image/png', contentLength: 1 }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(archiveStorage().write({ key: 'a', body: Buffer.from('a') })).rejects.toMatchObject({
    statusCode: 503,
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
it('pins the uploaded version and checksum, fully decodes bytes and stores a normalized immutable publication', async () => {
  const f = input();
  const body = await png();
  f.body.map.levels[0]!.image = { mediaKey: 'drafts/event/image', alt: 'Floor plan' };
  f.images = [{ key: 'drafts/event/image', contentType: 'image/png', contentLength: body.length }];
  const metadata = { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"', VersionId: 'source/version' };
  mocks.send
    .mockResolvedValueOnce(metadata)
    .mockResolvedValueOnce({ ...metadata, Body: Readable.from([body]) })
    .mockResolvedValueOnce({ VersionId: 'frozen/version' })
    .mockResolvedValue({});
  const published = await contentStorage().publish(f);
  const commands = mocks.send.mock.calls.map(([command]) => command.input);
  expect(commands[1]).toMatchObject({
    Key: 'drafts/event/image', IfMatch: '"source"', VersionId: 'source/version',
  });
  expect(commands[2]).toMatchObject({
    Key: 'content/event/version/map-0', IfNoneMatch: '*', ContentType: 'image/png',
  });
  expect(commands[3]).toMatchObject({
    Key: 'content/event/version.json',
    IfNoneMatch: '*',
    ContentType: 'application/json',
  });
  expect(published.body.map.levels[0]!.image!.mediaKey).toBe('content/event/version/map-0');
  expect(published.etag).toMatch(/^"[a-f0-9]{64}"$/);
  expect(published.imageManifest).toEqual([expect.objectContaining({ key: 'content/event/version/map-0',
    sourceEtag: '"source"', sourceVersionId: 'source/version', objectVersionId: 'frozen/version',
    sha256: createHash('sha256').update(commands[2]!.Body).digest('hex') })]);
  expect(await sharp(commands[2]!.Body).metadata()).toMatchObject({ format: 'png', width: 3, height: 2 });
});
it.each(['content-type', 'size', 'checksum'])(
  'refuses a changed or incomplete %s upload',
  async (change) => {
    const f = input();
    f.images = [{ key: 'drafts/event/image', contentType: 'image/png', contentLength: 12 }];
    mocks.send.mockResolvedValue({
      ContentType: change === 'content-type' ? 'image/svg+xml' : 'image/png',
      ContentLength: change === 'size' ? 13 : 12,
      ETag: change === 'checksum' ? undefined : '"source"',
    });
    await expect(contentStorage().publish(f)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  },
);
it('enforces the complete offline payload budget including JSON, not only individual images', async () => {
  const f = input();
  const body = await sharp(randomBytes(400 * 600 * 3), { raw: { width: 400, height: 600, channels: 3 } }).png().toBuffer();
  f.images = [0, 1, 2].map((id) => ({
    key: `drafts/event/${id}`,
    contentType: 'image/png',
    contentLength: body.length,
  }));
  mocks.send.mockImplementation(async (command) =>
    command.constructor.name === 'HeadObjectCommand'
      ? { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"' }
      : { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"', Body: Readable.from([body]) },
  );
  await expect(contentStorage().publish(f)).rejects.toMatchObject({ statusCode: 400 });
  expect(
    mocks.send.mock.calls.some(([command]) => command.constructor.name === 'PutObjectCommand'),
  ).toBe(false);
});
it('clones only the committed image version and digest into a new independently validated draft key', async () => {
  const body = await png();
  const metadata = { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"', VersionId: 'immutable/version' };
  mocks.send
    .mockResolvedValueOnce(metadata)
    .mockResolvedValueOnce({ ...metadata, Body: Readable.from([body]) })
    .mockResolvedValue({});
  const copied = await contentStorage().copyImage({
      sourceKey: 'content/source/version/map-0',
      key: 'drafts/target/image',
      receipt: { sha256: createHash('sha256').update(body).digest('hex'), objectVersionId: 'immutable/version',
        contentType: 'image/png', contentLength: body.length },
    });
  expect(copied).toMatchObject({ key: 'drafts/target/image', contentType: 'image/png', contentLength: expect.any(Number) });
  expect(mocks.send.mock.calls[0]![0].input.VersionId).toBe('immutable/version');
  expect(mocks.send.mock.calls[1]![0].input).toMatchObject({
    IfMatch: '"source"', VersionId: 'immutable/version',
  });
  expect(mocks.send.mock.calls[2]![0].input).toMatchObject({
    CacheControl: 'no-store', IfNoneMatch: '*',
    Key: 'drafts/target/image',
  });
  mocks.send.mockResolvedValueOnce({
    ContentType: 'image/png',
    ContentLength: 1024 * 1024 + 1,
    ETag: '"source"',
  });
  await expect(
    contentStorage().copyImage({ sourceKey: 'source', key: 'draft' }),
  ).rejects.toMatchObject({ statusCode: 400 });
});
it('reads authenticated bytes and handles absent content bodies', async () => {
  const body = await png();
  mocks.send.mockResolvedValueOnce({
    Body: Readable.from([body]),
    ContentType: 'image/png',
  });
  const read = await contentStorage().read('content/event/version/map-0');
  expect(read.contentType).toBe('image/png');
  expect(await sharp(read.body).metadata()).toMatchObject({ format: 'png', width: 3, height: 2 });
  mocks.send.mockResolvedValueOnce({});
  await expect(contentStorage().read('missing')).rejects.toMatchObject({ statusCode: 400 });
});
it('reads a committed receipt with its trusted type and version and refuses byte replacement', async () => {
  const body = await png();
  const receipt = { contentType: 'image/png', contentLength: body.length,
    objectVersionId: 'frozen/version', sha256: createHash('sha256').update(body).digest('hex') };
  mocks.send.mockResolvedValueOnce({ Body: Readable.from([body]), ContentType: 'text/html' });
  expect(await contentStorage().read('content/event/version/map-0', receipt)).toEqual({ body, contentType: 'image/png' });
  expect(mocks.send.mock.calls[0]![0].input.VersionId).toBe('frozen/version');
  mocks.send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from('replacement')]), ContentType: 'image/png' });
  await expect(contentStorage().read('content/event/version/map-0', receipt)).rejects.toMatchObject({ statusCode: 400 });
});
it('rejects MIME-correct active or truncated uploads before any immutable object is written', async () => {
  for (const body of [Buffer.from('<script>active</script>'), (await png()).subarray(0, 40)]) {
    const f = input(); f.images = [{ key: 'drafts/event/image', contentType: 'image/png', contentLength: body.length }];
    const metadata = { ContentType: 'image/png', ContentLength: body.length, ETag: '"source"' };
    mocks.send.mockReset().mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce({ ...metadata, Body: Readable.from([body]) });
    await expect(contentStorage().publish(f)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.send.mock.calls.some(([command]) => command.constructor.name === 'PutObjectCommand')).toBe(false);
  }
});
const png = () => sharp({ create: { width: 3, height: 2, channels: 3, background: '#1267ab' } }).png().toBuffer();
it('retires the exact immutable S3 version instead of creating a delete marker', async () => {
  mocks.send.mockResolvedValueOnce({ VersionId: 'orphan/version' }).mockResolvedValueOnce({});
  await contentStorage().deleteObject!('content/event/orphan.json');
  expect(mocks.send.mock.calls[1]![0].input).toEqual({ Bucket: 'content-test',
    Key: 'content/event/orphan.json', VersionId: 'orphan/version' });
  expect(mocks.send.mock.calls[1]![1].abortSignal).toBeInstanceOf(AbortSignal);
});
it('retries storage outages and refuses an unversioned cleanup target', async () => {
  mocks.send.mockResolvedValueOnce({});
  await expect(contentStorage().deleteObject!('content/event/orphan.json')).rejects.toMatchObject({ statusCode: 400 });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  const outage = new Error('Storage unavailable');
  mocks.send.mockRejectedValueOnce(outage);
  await expect(contentStorage().deleteObject!('content/event/orphan.json')).rejects.toBe(outage);
  mocks.send.mockRejectedValueOnce(Object.assign(new Error('Absent object'), { name: 'NotFound' }));
  await expect(contentStorage().deleteObject!('content/event/orphan.json')).resolves.toBeUndefined();
});
it('stores private immutable export workbooks and reads them without signed credential persistence', async () => {
  mocks.send
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ Body: { transformToByteArray: async () => Buffer.from('xlsx') } });
  await archiveStorage().write({ key: 'archive/event/id.xlsx', body: Buffer.from('xlsx') });
  expect(mocks.send.mock.calls[0]![0].input).toMatchObject({
    Bucket: 'exports-test',
    Key: 'archive/event/id.xlsx',
    IfNoneMatch: '*',
    CacheControl: 'no-store',
  });
  expect(await archiveStorage().read('archive/event/id.xlsx')).toEqual(Buffer.from('xlsx'));
  mocks.send.mockResolvedValueOnce({});
  await expect(archiveStorage().read('missing')).rejects.toMatchObject({ statusCode: 404 });
});
