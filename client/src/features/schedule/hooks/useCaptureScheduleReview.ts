import { useCaptureScheduleChange } from './useCaptureScheduleChange';
import { useCaptureScheduleDraft } from './useCaptureScheduleDraft';
import { useCaptureScheduleSubmit } from './useCaptureScheduleSubmit';
import {
  captureScheduleReviewBlocked,
  captureScheduleReviewStale,
} from '../model/captureScheduleReview';
import type { CaptureScheduleReviewInput } from '../model/captureScheduleControls';

export function useCaptureScheduleReview(input: CaptureScheduleReviewInput) {
  const change = useCaptureScheduleChange(input.onApplied);
  const draft = useCaptureScheduleDraft(input, change);
  const stale =
    captureScheduleReviewStale({ ...input, action: draft.action, reviewed: draft.reviewed }) ||
    draft.timezone !== input.timezone;
  const locked = change.mutation.isPending || change.uncertain;
  const disabled =
    change.denied ||
    change.blocked ||
    draft.loading ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    (!change.uncertain && captureScheduleReviewBlocked({ ...input, action: draft.action, stale }));
  const submit = useCaptureScheduleSubmit({ draft, change, disabled });
  return { ...change, ...draft, stale, locked, disabled, submit };
}
