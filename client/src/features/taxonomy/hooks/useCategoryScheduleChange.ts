import { useRef, useState } from 'react';
import type { CategoryActivityResponse } from '@spoh/shared';
import { createRetryIntent } from '@/shared/lib/retryIntent';
import { useCategoryScheduleMutation } from '../queries';
import {
  categoryScheduleFailure,
  type CategoryScheduleAttempt,
} from '../model/categoryScheduleReview';

const EMPTY = { denied: false, uncertain: false, blocked: false, error: null as string | null };
export function useCategoryScheduleChange(onApplied: (current: CategoryActivityResponse) => void) {
  const [state, setState] = useState(EMPTY);
  const attempt = useRef<CategoryScheduleAttempt | null>(null);
  const intent = useRef(createRetryIntent());
  const mutation = useCategoryScheduleMutation(onApplied);
  function apply(request: CategoryScheduleAttempt) {
    attempt.current = request;
    mutation.mutate(request, {
      onSuccess: () => setState(EMPTY),
      onError: (error) => setState(categoryScheduleFailure(error)),
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
    reject: (error: unknown) => setState(categoryScheduleFailure(error)),
    fail: (error: string) => setState((state) => ({ ...state, error })),
  };
}
