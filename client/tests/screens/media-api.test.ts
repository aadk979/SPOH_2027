import { afterEach, expect, it, vi } from 'vitest';
import { uploadFile } from '@/features/media/api';
import type { CreateUploadResponse } from '@spoh/shared';

const policy: CreateUploadResponse = {
  url: 'https://example.test/upload',
  fields: { key: 'item/photo.jpg', policy: 'signed' },
  key: 'item/photo.jpg',
  expiresIn: 60,
  maxBytes: 10000,
};
afterEach(() => vi.unstubAllGlobals());

it('sends signed fields before the photo without attaching application credentials', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetcher);
  const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
  await uploadFile(policy, file);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(policy.url);
  expect(options.method).toBe('POST');
  expect(options.headers).toBeUndefined();
  expect(options.credentials).toBeUndefined();
  const form = options.body as FormData;
  expect([...form.keys()]).toEqual(['key', 'policy', 'file']);
  expect(form.get('key')).toBe(policy.key);
  expect(form.get('file')).toBeInstanceOf(File);
});

it('rejects a failed object-storage upload instead of reporting a saved photo', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(uploadFile(policy, new File(['image'], 'photo.jpg'))).rejects.toThrow(
    'upload rejected with 403',
  );
});
