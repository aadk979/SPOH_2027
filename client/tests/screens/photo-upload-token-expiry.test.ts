import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { usePhotoUpload } from '@/features/media';
import { createUpload, uploadFile } from '@/features/media/api';
import { getSession, setSession, type Session } from '@/shared/lib/session';

vi.mock('@/features/media/hooks/useMediaAvailability', () => ({
  useMediaAvailability: () => true,
}));
vi.mock('@/features/media/api', () => ({ createUpload: vi.fn(), uploadFile: vi.fn() }));
const session: Session = {
  accessToken: 'synthetic-token',
  volunteerId: 'synthetic-person',
  displayName: 'Desk',
  role: 'VOLUNTEER',
  capabilities: ['own.read', 'lostFound.log'],
  expiresAt: Date.now() + 60_000,
  refreshAvailable: false,
};
afterEach(() => {
  cleanup();
  setSession(null);
});
it('keeps a selected File UUID while the expired token is replaced for the same person', async () => {
  setSession(session);
  let reject!: (error: Error) => void;
  const policy = {
    key: 'lost-found/synthetic.png',
    url: 'https://bucket.test/upload',
    fields: {},
    expiresIn: 300,
    maxBytes: 10000,
  };
  vi.mocked(createUpload)
    .mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    )
    .mockResolvedValue(policy);
  vi.mocked(uploadFile).mockResolvedValue(undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const file = new File(['synthetic-image'], 'photo.png', { type: 'image/png' });
  const { result } = renderHook(() => usePhotoUpload());
  let first!: Promise<void>;
  act(() => {
    first = result.current.upload(file);
  });
  act(() => {
    setSession({ ...session, expiresAt: Date.now() - 1 });
    expect(getSession()).toBeNull();
  });
  act(() => {
    setSession({
      ...session,
      accessToken: 'synthetic-renewed-token',
      expiresAt: Date.now() + 60_000,
    });
  });
  await act(async () => {
    reject(new Error('Synthetic timeout'));
    await first;
  });
  await act(() => result.current.upload(file));
  expect(vi.mocked(createUpload).mock.calls[1]![1].idempotencyKey).toBe(
    vi.mocked(createUpload).mock.calls[0]![1].idempotencyKey,
  );
  expect(result.current.key).toBe(policy.key);
});
