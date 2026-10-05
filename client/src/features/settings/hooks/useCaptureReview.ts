import type { ScopedSettingsReadResponse } from '@spoh/shared';
import {
  captureRow,
  captureReviewChanged,
  captureReviewBody,
  captureReviewBlocked,
  type CaptureAction,
} from '../model/captureControl';
import { useCaptureChange } from './useCaptureChange';
import { useCaptureReviewDraft } from './useCaptureReviewDraft';

export function useCaptureReview(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
}) {
  const change = useCaptureChange();
  const draft = useCaptureReviewDraft({ ...input, onReview: change.reset, onError: change.fail });
  const stale = captureReviewChanged(captureRow(draft.reviewed), captureRow(input.current));
  const disabled =
    change.denied ||
    change.blocked ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    draft.loading ||
    (!change.uncertain && captureReviewBlocked({ ...input, stale }));
  function submit() {
    if (disabled) return;
    if (change.uncertain) {
      change.retry();
      return;
    }
    if (!draft.confirmed) return;
    const body = captureReviewBody({
      current: draft.reviewed,
      action: input.action,
      reason: draft.form.values.reason,
    });
    const parsed = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
    if (!parsed) return;
    change.apply(
      'historyId' in parsed ? { kind: 'restore', body: parsed } : { kind: 'change', body: parsed },
    );
  }
  return {
    ...change,
    ...draft,
    stale,
    disabled,
    submit,
  };
}
