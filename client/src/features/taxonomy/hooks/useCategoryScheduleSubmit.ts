import { categoryScheduleAttempt, categoryScheduleBody } from '../model/categoryScheduleReview';
import type { useCategoryScheduleDraft } from './useCategoryScheduleDraft';
import type { useCategoryScheduleChange } from './useCategoryScheduleChange';

export function useCategoryScheduleSubmit(input: {
  draft: ReturnType<typeof useCategoryScheduleDraft>;
  change: ReturnType<typeof useCategoryScheduleChange>;
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
      const body = categoryScheduleBody({
        action: draft.action,
        current: draft.reviewed,
        fields: draft.form.values,
        timezone: draft.timezone,
      });
      const parsed = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
      if (parsed)
        change.apply(categoryScheduleAttempt(draft.action, draft.reviewed.data.id, parsed));
    } catch {
      change.fail('Choose a valid future date and time on the event clock.');
    }
  };
}
