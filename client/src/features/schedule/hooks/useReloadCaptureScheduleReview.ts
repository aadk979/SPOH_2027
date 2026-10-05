import { useState } from 'react';
import type { ScopedSettingsReadResponse, ScopedSettingsTarget } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { ApiError } from '@/shared/lib/apiErrors';
import { getCaptureSchedule } from '../api';
import type { CaptureScheduleReviewInput } from '../model/captureScheduleControls';
import type { CaptureScheduleAction } from '../model/captureScheduleReview';
import type { useCaptureScheduleChange } from './useCaptureScheduleChange';

export function useReloadCaptureScheduleReview(
  input: CaptureScheduleReviewInput & { target: ScopedSettingsTarget },
  onReviewed: (result: {
    current: ScopedSettingsReadResponse;
    action: CaptureScheduleAction;
  }) => void,
  change: ReturnType<typeof useCaptureScheduleChange>,
) {
  const eventId = useEventId();
  const [loading, setLoading] = useState(false);
  async function reload() {
    setLoading(true);
    try {
      const response =
        input.action.kind === 'create'
          ? null
          : await getCaptureSchedule(eventId, {
              id: input.action.schedule.id,
              target: input.target,
            });
      const current = response?.current ?? (await input.loadCurrent());
      if (!current) throw new Error('Current state unavailable');
      if (response) await input.refreshSchedules();
      const action: CaptureScheduleAction =
        response && input.action.kind !== 'create'
          ? { kind: input.action.kind, schedule: response.schedule }
          : input.action;
      input.onApplied(current);
      onReviewed({ current, action });
      change.reset();
    } catch (error) {
      if (captureScheduleReadDenied(error)) change.reject(error);
      else
        change.fail(
          'Current schedule and capture settings are unavailable. Reload before reviewing.',
        );
    } finally {
      setLoading(false);
    }
  }
  return { loading, reload };
}
function captureScheduleReadDenied(error: unknown) {
  return error instanceof ApiError && [401, 403].includes(error.status);
}
