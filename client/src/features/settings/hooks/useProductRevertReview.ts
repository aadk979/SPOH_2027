import type { EventSettingHistoryRecord, EventSettingsResponse } from '@spoh/shared';
import { useProductRevertChange } from './useProductRevertChange';
import { useProductRevertDraft } from './useProductRevertDraft';

/** An uncertain response retains its reviewed version/key even after a polling refresh. */
export function useProductRevertReview(input: {
  target: EventSettingHistoryRecord;
  current: EventSettingsResponse;
  loadCurrent: () => Promise<EventSettingsResponse | null>;
}) {
  const change = useProductRevertChange();
  const draft = useProductRevertDraft({ ...input, onReview: change.reset, onError: change.fail });
  const stale =
    draft.reviewed.versions[input.target.key] !== input.current.versions[input.target.key];
  const disabled =
    (stale && !change.uncertain) ||
    change.blocked ||
    change.denied ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    draft.loading;
  function submit() {
    if (disabled || !draft.confirmed || !input.target.values.available) return;
    const body = {
      key: input.target.key,
      historyId: input.target.id,
      expectedVersion: draft.reviewed.versions[input.target.key],
      reason: draft.form.values.reason.trim(),
    };
    const request = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
    if (request) change.apply(request);
  }
  return { ...change, ...draft, stale, disabled, submit };
}
