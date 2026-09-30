import { useEffect, useState } from 'react';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { getMediaConfig } from '../api';
export function useMediaAvailability() {
  const session = useCurrentSession();
  const eventId = useEventId();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    void getMediaConfig(eventId)
      .then((config) => {
        if (!cancelled) setAvailable(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session, eventId]);

  return available;
}
