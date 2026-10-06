import { useCategoryScheduleChange } from './useCategoryScheduleChange';
import { useCategoryScheduleDraft } from './useCategoryScheduleDraft';
import { useCategoryScheduleSubmit } from './useCategoryScheduleSubmit';
import { categoryScheduleAllowed, categoryScheduleStale } from '../model/categoryScheduleReview';
import type { CategoryScheduleReviewInput } from '../model/controls';

export function useCategoryScheduleReview(input: CategoryScheduleReviewInput) {
  const change = useCategoryScheduleChange(input.onApplied);
  const draft = useCategoryScheduleDraft(input, change);
  const stale =
    categoryScheduleStale({ ...input, action: draft.action, reviewed: draft.reviewed }) ||
    draft.timezone !== input.timezone;
  const locked = change.mutation.isPending || change.uncertain;
  const disabled =
    !input.accessAvailable ||
    change.denied ||
    change.blocked ||
    draft.loading ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    categoryReviewBlocked({
      uncertain: change.uncertain,
      stale,
      readUnavailable: input.readUnavailable,
      allowed: categoryScheduleAllowed(draft.action, input.current),
    });
  const submit = useCategoryScheduleSubmit({ draft, change, disabled });
  return { ...change, ...draft, stale, locked, disabled, submit };
}
function categoryReviewBlocked(input: {
  uncertain: boolean;
  stale: boolean;
  readUnavailable: boolean;
  allowed: boolean;
}) {
  return !input.uncertain && (input.stale || input.readUnavailable || !input.allowed);
}
