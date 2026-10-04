import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePhotoUpload } from '@/features/media';
import { createUpload, uploadFile } from '@/features/media/api';

const context = vi.hoisted(() => ({
  eventId: 'first-event',
  session: { volunteerId: 'first-person', accessToken: 'first-token' } as {
    volunteerId: string;
    accessToken: string;
  } | null,
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => context.eventId }));
vi.mock('@/features/session', () => ({ useCurrentSession: () => context.session }));
vi.mock('@/shared/lib/session', () => ({
  currentVolunteerId: () => context.session?.volunteerId ?? null,
}));
vi.mock('@/features/media/hooks/useMediaAvailability', () => ({
  useMediaAvailability: () => true,
}));
vi.mock('@/features/media/api', () => ({ createUpload: vi.fn(), uploadFile: vi.fn() }));
const policy = {
  key: 'lost-found/photo.png',
  url: 'https://bucket.test/upload',
  fields: { policy: 'synthetic' },
  expiresIn: 300,
  maxBytes: 10000,
};
const photo = () => new File(['synthetic-image'], 'photo.png', { type: 'image/png' });
beforeEach(() => {
  context.eventId = 'first-event';
  context.session = { volunteerId: 'first-person', accessToken: 'first-token' };
  vi.mocked(createUpload).mockReset().mockResolvedValue(policy);
  vi.mocked(uploadFile).mockReset().mockResolvedValue(undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(cleanup);
it('keeps one UUID after a policy-request timeout for the same selected File', async () => {
  vi.mocked(createUpload).mockRejectedValueOnce(new Error('timeout'));
  const file = photo();
  const { result } = renderHook(() => usePhotoUpload());
  await act(() => result.current.upload(file));
  expect(result.current.state).toBe('error');
  expect(result.current.canRetry).toBe(true);
  await act(() => result.current.retry());
  const [first, second] = vi.mocked(createUpload).mock.calls;
  expect(first![1].idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(second![1].idempotencyKey).toBe(first![1].idempotencyKey);
  expect(result.current.key).toBe(policy.key);
});

it('keeps the UUID after an object-upload failure and clears an earlier attached key', async () => {
  const file = photo();
  const { result } = renderHook(() => usePhotoUpload());
  await act(() => result.current.upload(file));
  expect(result.current.key).toBe(policy.key);
  vi.mocked(uploadFile).mockRejectedValueOnce(new Error('timeout'));
  await act(() => result.current.upload(file));
  expect(result.current.key).toBeNull();
  expect(result.current.previewUrl).toBeNull();
  await act(() => result.current.upload(file));
  expect(
    new Set(vi.mocked(createUpload).mock.calls.map(([, body]) => body.idempotencyKey)).size,
  ).toBe(1);
});

it('allocates a new UUID for a different File even with identical metadata', async () => {
  const { result } = renderHook(() => usePhotoUpload());
  await act(() => result.current.upload(photo()));
  await act(() => result.current.upload(photo()));
  expect(vi.mocked(createUpload).mock.calls[1]![1].idempotencyKey).not.toBe(
    vi.mocked(createUpload).mock.calls[0]![1].idempotencyKey,
  );
});

it('discards the intent and preview on reset, allowing the same File to start anew', async () => {
  const file = photo();
  const { result } = renderHook(() => usePhotoUpload());
  await act(() => result.current.upload(file));
  act(() => result.current.reset());
  expect(result.current).toMatchObject({ state: 'idle', key: null, previewUrl: null });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-preview');
  await act(() => result.current.upload(file));
  expect(vi.mocked(createUpload).mock.calls[1]![1].idempotencyKey).not.toBe(
    vi.mocked(createUpload).mock.calls[0]![1].idempotencyKey,
  );
});

it('retains the intent when the same person receives a refreshed token', async () => {
  const file = photo();
  const { result, rerender } = renderHook(() => usePhotoUpload());
  vi.mocked(createUpload).mockRejectedValueOnce(new Error('timeout'));
  await act(() => result.current.upload(file));
  context.session = { volunteerId: 'first-person', accessToken: 'new-token' };
  rerender();
  await act(() => result.current.upload(file));
  expect(vi.mocked(createUpload).mock.calls[1]![1].idempotencyKey).toBe(
    vi.mocked(createUpload).mock.calls[0]![1].idempotencyKey,
  );
});

it.each(['event', 'person', 'sign-out', 'reset', 'unmount'])(
  'discards an old policy response after %s before uploading its file',
  async (change) => {
    let resolve!: (value: typeof policy) => void;
    vi.mocked(createUpload).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result, rerender, unmount } = renderHook(() => usePhotoUpload());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.upload(photo());
    });
    if (change === 'event') context.eventId = 'second-event';
    if (change === 'person')
      context.session = { volunteerId: 'second-person', accessToken: 'other-token' };
    if (change === 'sign-out') context.session = null;
    if (change === 'reset') act(() => result.current.reset());
    if (change === 'unmount') unmount();
    else rerender();
    await act(async () => {
      resolve(policy);
      await pending;
    });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    if (change !== 'unmount')
      expect(result.current).toMatchObject({ state: 'idle', key: null, previewUrl: null });
  },
);

it('discards object-upload completion after the current person changes', async () => {
  let resolve!: () => void;
  vi.mocked(uploadFile).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(() => usePhotoUpload());
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.upload(photo());
    await Promise.resolve();
  });
  context.session = { volunteerId: 'second-person', accessToken: 'other-token' };
  rerender();
  await act(async () => {
    resolve();
    await pending;
  });
  expect(result.current.key).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('ignores an older selected file completing after a new selection', async () => {
  let resolve!: (value: typeof policy) => void;
  vi.mocked(createUpload)
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    )
    .mockResolvedValueOnce({ ...policy, key: 'lost-found/new.png' });
  const { result } = renderHook(() => usePhotoUpload());
  let old!: Promise<void>;
  act(() => {
    old = result.current.upload(photo());
  });
  await act(() => result.current.upload(photo()));
  await act(async () => {
    resolve(policy);
    await old;
  });
  expect(result.current.key).toBe('lost-found/new.png');
  expect(uploadFile).toHaveBeenCalledOnce();
});

it('does not start an upload when signed out or with an unsupported file', async () => {
  context.session = null;
  const { result, rerender } = renderHook(() => usePhotoUpload());
  expect(result.current.available).toBe(false);
  await act(() => result.current.upload(photo()));
  context.session = { volunteerId: 'first-person', accessToken: 'first-token' };
  rerender();
  await act(() => result.current.upload(new File(['text'], 'file.txt', { type: 'text/plain' })));
  expect(createUpload).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ state: 'error', key: null });
});

it('rejects a response after synchronous sign-out before React commits its render', async () => {
  let resolve!: (value: typeof policy) => void;
  vi.mocked(createUpload).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(() => usePhotoUpload());
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.upload(photo());
  });
  context.session = null;
  await act(async () => {
    resolve(policy);
    await pending;
  });
  expect(uploadFile).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
