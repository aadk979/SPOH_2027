import { captureScheduleAttempt, captureScheduleBody } from '../model/captureScheduleReview';
import type { useCaptureScheduleDraft } from './useCaptureScheduleDraft';
import type { useCaptureScheduleChange } from './useCaptureScheduleChange';

export function useCaptureScheduleSubmit(input: {
  draft: ReturnType<typeof useCaptureScheduleDraft>;
  change: ReturnType<typeof useCaptureScheduleChange>;
  disabled: boolean;
}) {
  return () => {
    const { draft, change } = input;
    if (input.disabled) return;
    if (change.uncertain) {
      change.retry();
      return;
    }
    if (!draft.confirmed) return;
    try {
      const body = captureScheduleBody({
        action: draft.action,
        current: draft.reviewed,
        fields: draft.form.values,
        timezone: draft.timezone,
      });
      const parsed = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
      if (parsed) change.apply(captureScheduleAttempt(draft.action, draft.reviewed, parsed));
    } catch {
      change.fail('Choose a valid future date and time on the event clock.');
    }
  };
}
