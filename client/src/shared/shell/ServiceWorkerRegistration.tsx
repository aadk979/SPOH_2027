'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker (BUILD_PLAN §9.6).
 *
 * Best effort and deliberately silent on failure: a volunteer whose browser
 * refuses to register a worker should still get a fully working app, just
 * without the offline shell.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = (): void => {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };

    // Registering after load keeps the worker off the critical path for the
    // first paint, which matters on a congested venue network.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
