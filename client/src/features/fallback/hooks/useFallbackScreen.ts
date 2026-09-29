import { useState } from 'react';
import { DeclareFallbackRequest } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useStations } from '@/features/stations';
import { ApiError } from '@/shared/lib/apiErrors';
import { useFallbackWindows, useDeclareFallback, useCloseFallback } from '../queries';
import { EMPTY_DECLARATION, toDeclareFallbackRequest } from '../model/declareRequest';
export function useFallbackScreen(enabled: boolean) {
  const form = useZodForm(DeclareFallbackRequest, EMPTY_DECLARATION);
  const setReason = form.setter('reason');
  const [error, setError] = useState<string | null>(null);
  const windows = useFallbackWindows(enabled);
  const stations = useStations(enabled);

  const declare = useDeclareFallback({
    onSuccess: () => {
      setReason('');
      setError(null);
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : 'Could not declare the window.'),
  });
  const close = useCloseFallback();

  function submit(): void {
    const parsed = form.validate(toDeclareFallbackRequest(form.values));
    if (parsed) declare.mutate(parsed);
  }
  return {
    ...form.values,
    submit,
    errors: form.errors,
    setTier: form.setter('tier'),
    setReason,
    setStationId: form.setter('stationId'),
    error,
    windows,
    stations,
    declare,
    close,
  };
}
export type FallbackController = ReturnType<typeof useFallbackScreen>;
