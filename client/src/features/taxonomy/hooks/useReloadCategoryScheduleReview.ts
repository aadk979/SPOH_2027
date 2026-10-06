import { useState } from 'react';
import type { CategoryActivityResponse } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { ApiError } from '@/shared/lib/apiErrors';
import { getCategoryActivity, getCategorySchedule } from '../api';
import type { CategoryScheduleReviewInput } from '../model/controls';
import type { CategoryScheduleAction } from '../model/categoryScheduleReview';
import type { useCategoryScheduleChange } from './useCategoryScheduleChange';

export function useReloadCategoryScheduleReview(
  input: CategoryScheduleReviewInput,
  onReviewed: (result: {
    current: CategoryActivityResponse;
    action: CategoryScheduleAction;
  }) => void,
  change: ReturnType<typeof useCategoryScheduleChange>,
) {
  const eventId = useEventId();
  const [loading, setLoading] = useState(false);
  async function reload() {
    if (!input.accessAvailable) return;
    setLoading(true);
    try {
      const response =
        input.action.kind === 'create'
          ? null
          : await getCategorySchedule(eventId, {
              categoryId: input.current.data.id,
              id: input.action.schedule.id,
            });
      const current =
        response?.current ?? (await getCategoryActivity(eventId, input.current.data.id));
      await input.refreshSchedules();
      const action: CategoryScheduleAction =
        response && input.action.kind !== 'create'
          ? { kind: input.action.kind, schedule: response.schedule }
          : input.action;
      input.onApplied(current);
      onReviewed({ current, action });
      change.reset();
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) change.reject(error);
      else change.fail('Current category and schedule are unavailable. Reload before reviewing.');
    } finally {
      setLoading(false);
    }
  }
  return { loading, reload };
}
