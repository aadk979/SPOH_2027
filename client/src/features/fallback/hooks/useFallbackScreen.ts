import { useState } from 'react';
import { useStations } from '@/features/stations';
import { ApiError } from '@/shared/lib/apiErrors';
import { useFallbackWindows, useDeclareFallback, useCloseFallback } from '../queries';
export function useFallbackScreen(enabled: boolean) {
  const [tier, setTier] = useState<'3' | '4'>('3');
  const [reason, setReason] = useState('');
  const [stationId, setStationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const windows = useFallbackWindows(enabled);

  const stations = useStations(enabled);

  const declare = useDeclareFallback(
    { tier: Number(tier) as 3 | 4, reason: reason.trim(), ...(stationId ? { stationId } : {}) },
    {
      onSuccess: () => {
        setReason('');
        setError(null);
      },
      onError: (cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Could not declare the window.'),
    },
  );
  const close = useCloseFallback();

  return {
    tier,
    setTier,
    reason,
    setReason,
    stationId,
    setStationId,
    error,
    windows,
    stations,
    declare,
    close,
  };
}
export type FallbackController = ReturnType<typeof useFallbackScreen>;
