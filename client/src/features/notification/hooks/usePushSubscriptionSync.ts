import { useEffect } from 'react';
import { useCurrentSession } from '@/features/session';
import { pushSupported, syncPushSubscription } from '../pushSync';

/** Re-registers this phone's push subscription when it or the volunteer changes (F03-035). */
export function usePushSubscriptionSync(): void {
  const volunteerId = useCurrentSession()?.volunteerId ?? null;

  useEffect(() => {
    if (!volunteerId || !pushSupported()) return;
    const sync = (): void => void syncPushSubscription(volunteerId).catch(() => undefined);
    const onMessage = (event: MessageEvent): void => {
      if ((event.data as { type?: string } | null)?.type === 'push-subscription-changed') sync();
    };
    sync();
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [volunteerId]);
}
