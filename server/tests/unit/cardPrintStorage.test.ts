import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ bucket: '' as string | undefined, send: vi.fn() }));
vi.mock('../../src/config/env.js', () => ({
  env: {
    get S3_EXPORTS_BUCKET() {
      return state.bucket;
    },
    AWS_REGION: 'ap-southeast-1',
  },
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = state.send;
  },
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
import {
  cardPrintStorage,
  useCardPrintStorage,
} from '../../src/modules/missionCard/application/printStorage.js';
afterEach(() => {
  state.bucket = undefined;
  state.send.mockReset();
});
it('refuses exports when private storage is not configured', async () => {
  await expect(cardPrintStorage().read('key')).rejects.toThrow('not configured');
  await expect(
    cardPrintStorage().write({
      key: 'key',
      body: Buffer.from('pdf'),
      contentType: 'application/pdf',
    }),
  ).rejects.toThrow('not configured');
});
it('writes only a private immutable no-store object and reads its bytes', async () => {
  state.bucket = 'private-test';
  state.send
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({ Body: { transformToByteArray: async () => new Uint8Array([1, 2]) } });
  await cardPrintStorage().write({
    key: 'card-print/key',
    body: Buffer.from('pdf'),
    contentType: 'application/pdf',
  });
  expect(state.send.mock.calls[0]![0].input).toMatchObject({
    Bucket: 'private-test',
    Key: 'card-print/key',
    IfNoneMatch: '*',
    CacheControl: 'no-store',
    ContentType: 'application/pdf',
  });
  expect(await cardPrintStorage().read('card-print/key')).toEqual(new Uint8Array([1, 2]));
});
it('reports a missing stored body and restores an injected storage adapter', async () => {
  state.bucket = 'private-test';
  state.send.mockResolvedValue({});
  await expect(cardPrintStorage().read('missing')).rejects.toThrow('not found');
  const previous = cardPrintStorage();
  const restore = useCardPrintStorage({
    read: async () => new Uint8Array([3]),
    write: async () => {},
  });
  expect(await cardPrintStorage().read('injected')).toEqual(new Uint8Array([3]));
  restore();
  expect(cardPrintStorage()).toBe(previous);
});
