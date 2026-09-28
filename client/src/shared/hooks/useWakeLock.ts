'use client';

import { useEffect } from 'react';

/**
 * Hold a screen wake lock while a capture screen is open.
 *
 * A booth tablet that sleeps between visitors costs a tap to wake and a second
 * of the volunteer's attention every time. Best effort: not every browser
 * supports it, and it is released automatically when the tab is hidden.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = async (): Promise<void> => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied, unsupported, or the tab is not visible. Not worth surfacing.
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && !released) void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
