import type { LifecycleReadinessResponse } from '@spoh/shared';
import { useLifecycleChange } from './useLifecycleChange';
import { useLifecycleDraft } from './useLifecycleDraft';

export function useLifecycleReview(
  readiness: LifecycleReadinessResponse,
  loadCurrent: () => Promise<LifecycleReadinessResponse | null>,
) {
  const change = useLifecycleChange();
  const draft = useLifecycleDraft({
    readiness,
    loadCurrent,
    onReview: change.reset,
    onError: change.fail,
  });
  const { reviewed, option, confirmed, loading, form } = draft;
  const stale =
    change.conflict ||
    readiness.lifecycle.version !== reviewed.lifecycle.version ||
    JSON.stringify(readiness.transitions) !== JSON.stringify(reviewed.transitions);
  const cannotSubmit =
    !option?.allowed || stale || change.saved || change.mutation.isPending || loading;
  function submit() {
    if (cannotSubmit || !option) return;
    if (!confirmed) {
      change.fail('Confirm that you have reviewed this transition.');
      return;
    }
    if (option.requiresReason && !form.values.reason.trim()) {
      change.fail('Enter a reason for reopening.');
      return;
    }
    const input = {
      to: form.values.to,
      expectedVersion: reviewed.lifecycle.version,
      ...(form.values.reason.trim() ? { reason: form.values.reason.trim() } : {}),
    };
    const request = form.validate({ ...input, idempotencyKey: change.keyFor(input) });
    if (request) change.apply(request);
  }
  return {
    ...change,
    ...draft,
    stale,
    submit,
  };
}
