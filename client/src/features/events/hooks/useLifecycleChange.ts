import { useRef, useState } from 'react';
import type { TransitionEventRequest } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useTransitionLifecycle } from '../queries';
import { lifecycleAccessDenied, lifecycleError } from '../model/lifecycleCopy';

const EMPTY = { error: null as string | null, denied: false, saved: false, conflict: false };
export function useLifecycleChange() {
  const [state, setState] = useState(EMPTY);
  const intent = useRef(createRetryIntent());
  const mutation = useTransitionLifecycle();
  function reset() {
    setState(EMPTY);
    intent.current.clear();
  }
  function fail(error: string) {
    setState((current) => ({ ...current, error }));
  }
  function apply(request: TransitionEventRequest) {
    setState(EMPTY);
    mutation.mutate(request, {
      onSuccess: () => {
        setState({ ...EMPTY, saved: true });
        intent.current.clear();
      },
      onError: (failure) =>
        setState({
          ...EMPTY,
          error: lifecycleError(failure),
          denied: lifecycleAccessDenied(failure),
          conflict: failure instanceof ApiError && failure.status === 409,
        }),
    });
  }
  return {
    ...state,
    mutation,
    reset,
    fail,
    apply,
    keyFor: (input: unknown) => intent.current.keyFor(input),
  };
}
