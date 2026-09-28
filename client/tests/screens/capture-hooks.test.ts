import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIdleNudge } from '@/features/footfall/hooks/useIdleNudge';
import { useScanResult } from '@/features/capture/useScanResult';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('capture hook lifetime', () => {
  it('restarts inactivity on a recorded tap and clears its timer on unmount', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ count }) => useIdleNudge(count), {
      initialProps: { count: 0 },
    });
    act(() => vi.advanceTimersByTime(19 * 60 * 1000));
    expect(result.current.idle).toBe(false);
    rerender({ count: 1 });
    act(() => vi.advanceTimersByTime(19 * 60 * 1000));
    expect(result.current.idle).toBe(false);
    act(() => vi.advanceTimersByTime(60 * 1000));
    expect(result.current.idle).toBe(true);
    act(() => result.current.resetIdle());
    expect(result.current.idle).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('delivers scans to the latest handler without changing the scanner callback', () => {
    const first = vi.fn(),
      second = vi.fn();
    const { result, rerender } = renderHook(({ handler }) => useScanResult(handler), {
      initialProps: { handler: first },
    });
    const receive = result.current.receive;
    act(() => receive('ABC234'));
    expect(first).toHaveBeenCalledWith('ABC234');
    expect(result.current.result).toBe('ABC234');
    rerender({ handler: second });
    expect(result.current.receive).toBe(receive);
    act(() => receive('DEF567'));
    expect(second).toHaveBeenCalledWith('DEF567');
    act(() => result.current.resume());
    expect(result.current.result).toBeNull();
  });
});
