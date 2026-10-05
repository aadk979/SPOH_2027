import { useRef, useState } from 'react';
import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useCaptureScheduleMutation } from '../queries';
import {
  captureScheduleFailure,
  type CaptureScheduleAttempt,
} from '../model/captureScheduleReview';

const EMPTY = { denied: false, uncertain: false, blocked: false, error: null as string | null };
export function useCaptureScheduleChange(onApplied: (current: ScopedSettingsReadResponse) => void) {
  const [state, setState] = useState(EMPTY);
  const attempt = useRef<CaptureScheduleAttempt | null>(null);
  const intent = useRef(createRetryIntent());
  const mutation = useCaptureScheduleMutation(onApplied);
  function apply(request: CaptureScheduleAttempt) {
    attempt.current = request;
    mutation.mutate(request, {
      onSuccess: () => setState(EMPTY),
      onError: (error) => setState(captureScheduleFailure(error)),
    });
  }
  function reset() {
    attempt.current = null;
    intent.current.clear();
    mutation.reset();
    setState(EMPTY);
  }
  return {
    ...state,
    mutation,
    apply,
    reset,
    keyFor: (body: unknown) => intent.current.keyFor(body),
    retry: () => {
      if (attempt.current) apply(attempt.current);
    },
    reject: (error: unknown) => setState(captureScheduleFailure(error)),
    fail: (error: string) => setState((state) => ({ ...state, error })),
  };
}
