import { useRef, useState } from 'react';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useApplyScopedSettingChange } from '../queries';
import type { ScopedSettingRequest, scopedSettingFailure } from '../model/scopedSettingChange';

const EMPTY = { error: null as string | null, denied: false, blocked: false, uncertain: false };
export function useScopedSettingChange(
  describeFailure: (failure: unknown) => ReturnType<typeof scopedSettingFailure>,
) {
  const [state, setState] = useState(EMPTY);
  const attempt = useRef<ScopedSettingRequest | null>(null);
  const intent = useRef(createRetryIntent());
  const mutation = useApplyScopedSettingChange();
  function reset() {
    setState(EMPTY);
    mutation.reset();
    attempt.current = null;
    intent.current.clear();
  }
  function apply(request: ScopedSettingRequest) {
    attempt.current = request;
    mutation.mutate(request, {
      onSuccess: () => setState(EMPTY),
      onError: (failure) => setState(describeFailure(failure)),
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
