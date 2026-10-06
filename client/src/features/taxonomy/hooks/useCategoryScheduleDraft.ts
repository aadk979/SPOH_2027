import { useState } from 'react';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { categoryScheduleFields, categoryScheduleSchema } from '../model/categoryScheduleReview';
import type { CategoryScheduleReviewInput } from '../model/controls';
import type { useCategoryScheduleChange } from './useCategoryScheduleChange';
import { useReloadCategoryScheduleReview } from './useReloadCategoryScheduleReview';

export function useCategoryScheduleDraft(
  input: CategoryScheduleReviewInput,
  change: ReturnType<typeof useCategoryScheduleChange>,
) {
  const [action, setAction] = useState(input.action);
  const [reviewed, setReviewed] = useState(input.current);
  const [timezone, setTimezone] = useState(input.timezone);
  const [confirmed, setConfirmed] = useState(false);
  const form = useZodForm(
    categoryScheduleSchema(action),
    categoryScheduleFields(action, input.current, input.timezone),
    { runAt: 'wallTime' },
  );
  const reload = useReloadCategoryScheduleReview(
    { ...input, action, current: reviewed },
    (result) => {
      setReviewed(result.current);
      setAction(result.action);
      setTimezone(input.timezone);
      form.reset(categoryScheduleFields(result.action, result.current, input.timezone));
      setConfirmed(false);
    },
    change,
  );
  return { action, reviewed, timezone, confirmed, setConfirmed, form, ...reload };
}
