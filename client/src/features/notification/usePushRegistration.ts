'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PushConfigResponse } from '@spoh/shared';
import { api } from '@/lib/api';
import { useCurrentSession } from '../session/useSession';

/**
 * Push registration.
 *
 * ── Why this is not automatic ───────────────────────────────────────────────
 *
 * Browsers require a user gesture for the notification prompt, and a prompt
 * that appears the instant an app opens is the one people dismiss forever
 * without reading. So this exposes state and an `enable()` the UI calls from a
 * button, and never asks on its own.
 *
 * ── Why a failure here is not an error ──────────────────────────────────────
 *
 * Push is best effort by design: the ten-second lost-person poll and the
 * three-second dashboard poll are the delivery guarantee. A volunteer on an
 * older iPhone, in a browser with notifications blocked, or behind a push
 * service the network drops still gets every alert — a moment later, and only
 * while the app is open. So every path below degrades to `unsupported` or
 * `denied` and the app carries on.
 */

export type PushState =
  'loading' | 'unsupported' | 'unconfigured' | 'denied' | 'prompt' | 'subscribed';

/**
 * VAPID keys travel as base64url; `applicationServerKey` wants raw bytes.
 *
 * Returns an `ArrayBuffer` rather than a `Uint8Array`: the DOM types narrow the
 * field to a view over a plain `ArrayBuffer`, and a `Uint8Array` — whose backing
 * buffer may be a `SharedArrayBuffer` — does not satisfy that.
 */
function decodeKey(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);

  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export interface UsePushRegistrationResult {
  state: PushState;
  /** Ask for permission and register. Call from a click, never on mount. */
  enable(): Promise<void>;
  disable(): Promise<void>;
  error: string | null;
}

export function usePushRegistration(): UsePushRegistrationResult {
  const session = useCurrentSession();
  const [state, setState] = useState<PushState>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    if (!supported()) {
      setState('unsupported');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const config = await api<PushConfigResponse>('/notifications/config');
        if (cancelled) return;

        if (!config.enabled || !config.publicKey) {
          // The deployment has no VAPID keys. Not a fault — a quieter system.
          setState('unconfigured');
          return;
        }

        setPublicKey(config.publicKey);

        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        setState(existing && Notification.permission === 'granted' ? 'subscribed' : 'prompt');
      } catch {
        if (!cancelled) setState('unsupported');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const enable = useCallback(async (): Promise<void> => {
    setError(null);

    if (!publicKey) return;

    try {
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // `userVisibleOnly` is required by Chrome and is also the honest
      // declaration: every push this app sends puts something on screen.
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error('the browser returned an incomplete subscription');
      }

      await api('/notifications/subscriptions', {
        method: 'POST',
        body: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
      });

      setState('subscribed');
    } catch {
      setError('Could not turn on alerts on this device. You will still see them in the app.');
      setState('prompt');
    }
  }, [publicKey]);

  const disable = useCallback(async (): Promise<void> => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      // Tell the server first: a subscription we forget about server-side keeps
      // consuming a delivery attempt on every urgent broadcast, forever.
      await api('/notifications/subscriptions', {
        method: 'DELETE',
        body: { endpoint: subscription.endpoint },
      });

      await subscription.unsubscribe();
      setState('prompt');
    } catch {
      setError('Could not turn alerts off. Try again, or check your browser settings.');
    }
  }, []);

  return { state, enable, disable, error };
}
