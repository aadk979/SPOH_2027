import { useEffect, useState } from 'react';
import { useCurrentSession } from '@/features/session';
import { getMediaConfig } from '../api';
export function useMediaAvailability() {
  const session = useCurrentSession();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    void getMediaConfig()
      .then((config) => {
        if (!cancelled) setAvailable(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  return available;
}
