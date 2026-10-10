import { beforeEach, expect, it, vi } from 'vitest';
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
it('pins the uploaded object version and checksum before its immutable copy and JSON publication', async () => {
  const f = input();
  f.body.map.levels[0]!.image = { mediaKey: 'drafts/event/image', alt: 'Floor plan' };
  f.images = [{ key: 'drafts/event/image', contentType: 'image/png', contentLength: 12 }];
  mocks.send
    .mockResolvedValueOnce({
      ContentType: 'image/png',
      ContentLength: 12,
      ETag: '"source"',
      VersionId: 'source/version',
    })
    .mockResolvedValue({});
  const published = await contentStorage().publish(f);
  const commands = mocks.send.mock.calls.map(([command]) => command.input);
  expect(commands[1]).toMatchObject({
    CopySource: 'content-test/drafts/event/image?versionId=source%2Fversion',
    CopySourceIfMatch: '"source"',
    Key: 'content/event/version/map-0',
    MetadataDirective: 'REPLACE',
  });
  expect(commands[2]).toMatchObject({
    Key: 'content/event/version.json',
    IfNoneMatch: '*',
    ContentType: 'application/json',
  });
  expect(published.body.map.levels[0]!.image!.mediaKey).toBe('content/event/version/map-0');
  expect(published.etag).toMatch(/^"[a-f0-9]{64}"$/);
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
  f.images = [0, 1].map((id) => ({
    key: `drafts/event/${id}`,
    contentType: 'image/png',
    contentLength: 1024 * 1024,
  }));
  mocks.send.mockImplementation(async (command) =>
    command.constructor.name === 'HeadObjectCommand'
      ? { ContentType: 'image/png', ContentLength: 1024 * 1024, ETag: '"source"' }
      : {},
  );
  await expect(contentStorage().publish(f)).rejects.toMatchObject({ statusCode: 400 });
  expect(
    mocks.send.mock.calls.some(([command]) => command.constructor.name === 'PutObjectCommand'),
  ).toBe(false);
});
it('copies an immutable source floor plan into the clone own draft key and validates size', async () => {
  mocks.send
    .mockResolvedValueOnce({ ContentType: 'image/webp', ContentLength: 24, ETag: '"source"' })
    .mockResolvedValue({});
  expect(
    await contentStorage().copyImage({
      sourceKey: 'content/source/version/map-0',
      key: 'drafts/target/image',
    }),
  ).toEqual({ key: 'drafts/target/image', contentType: 'image/webp', contentLength: 24 });
  expect(mocks.send.mock.calls[1]![0].input).toMatchObject({
    CacheControl: 'no-store',
    CopySourceIfMatch: '"source"',
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
  mocks.send.mockResolvedValueOnce({
    Body: { transformToByteArray: async () => Buffer.from('image') },
    ContentType: 'image/png',
  });
  expect(await contentStorage().read('content/event/version/map-0')).toEqual({
    body: Buffer.from('image'),
    contentType: 'image/png',
  });
  mocks.send.mockResolvedValueOnce({});
  await expect(contentStorage().read('missing')).rejects.toMatchObject({ statusCode: 400 });
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
