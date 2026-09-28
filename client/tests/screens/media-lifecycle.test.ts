import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaAvailability } from '@/features/media/hooks/useMediaAvailability';
import { getMediaConfig } from '@/features/media/api';
const state = vi.hoisted(() => ({ session: null as { accessToken: string } | null }));
vi.mock('@/features/session', () => ({ useCurrentSession: () => state.session }));
vi.mock('@/features/media/api', () => ({ getMediaConfig: vi.fn() }));
const config = vi.mocked(getMediaConfig);
beforeEach(() => {
  state.session = null;
  config.mockReset();
});
afterEach(cleanup);
describe('media availability lifecycle', () => {
  it('waits for a session before checking availability', async () => {
    config.mockResolvedValue({ enabled: true });
    const { result, rerender } = renderHook(() => useMediaAvailability());
    expect(config).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
    state.session = { accessToken: 'session' };
    rerender();
    await waitFor(() => expect(result.current).toBe(true));
  });
  it('does not apply a stale response after the session changes', async () => {
    let resolve!: (value: { enabled: boolean }) => void;
    config
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      )
      .mockResolvedValueOnce({ enabled: false });
    state.session = { accessToken: 'first' };
    const { result, rerender } = renderHook(() => useMediaAvailability());
    state.session = { accessToken: 'second' };
    rerender();
    await act(async () => {
      resolve({ enabled: true });
    });
    expect(result.current).toBe(false);
  });
  it('treats config failure as unavailable', async () => {
    state.session = { accessToken: 'session' };
    config.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMediaAvailability());
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
