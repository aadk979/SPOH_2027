import { useRef, useState } from 'react';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useApplyCaptureChange } from '../queries';
import { captureFailure, type CaptureRequest } from '../model/captureControl';

const EMPTY = { error: null as string | null, denied: false, blocked: false, uncertain: false };
export function useCaptureChange() {
  const [state, setState] = useState(EMPTY);
  const attempt = useRef<CaptureRequest | null>(null);
  const intent = useRef(createRetryIntent());
  const mutation = useApplyCaptureChange();
  function reset() {
    setState(EMPTY);
    mutation.reset();
    attempt.current = null;
    intent.current.clear();
  }
  function apply(request: CaptureRequest) {
    attempt.current = request;
    mutation.mutate(request, {
      onSuccess: () => setState(EMPTY),
      onError: (failure) => setState(captureFailure(failure)),
    });
  }
  return {
    ...state,
    mutation,
    reset,
    apply,
    fail: (error: string) => setState((current) => ({ ...current, error })),
    retry: () => {
      if (attempt.current) apply(attempt.current);
    },
    keyFor: (body: unknown) => intent.current.keyFor(body),
  };
}
