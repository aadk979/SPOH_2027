import { useEffect, useState } from 'react';
import { useCurrentSession } from '@/features/session';
import { getPushConfig } from '../api';
import type { PushState } from '../pushTypes';
import { pushSupported } from '../pushSync';
export function usePushConfig() {
  const session = useCurrentSession();
  const [state, setState] = useState<PushState>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;

    if (!pushSupported()) {
      setState('unsupported');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const config = await getPushConfig();
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

  return { state, setState, publicKey };
}
