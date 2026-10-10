import { useState } from 'react';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { captureScheduleFields, captureScheduleSchema } from '../model/captureScheduleReview';
import type { CaptureScheduleReviewInput } from '../model/captureScheduleControls';
import type { useCaptureScheduleChange } from './useCaptureScheduleChange';
import { useReloadCaptureScheduleReview } from './useReloadCaptureScheduleReview';

export function useCaptureScheduleDraft(
  input: CaptureScheduleReviewInput,
  change: ReturnType<typeof useCaptureScheduleChange>,
) {
  const [action, setAction] = useState(input.action);
  const [reviewed, setReviewed] = useState(input.current);
  const [timezone, setTimezone] = useState(input.timezone);
  const [confirmed, setConfirmed] = useState(false);
  const form = useZodForm(
    captureScheduleSchema(action),
    captureScheduleFields(action, input.timezone, input.current),
    { runAt: 'wallTime' },
  );
  const reload = useReloadCaptureScheduleReview(
    { ...input, action, target: reviewed.target },
    (result) => {
      setReviewed(result.current);
      setAction(result.action);
      setTimezone(input.timezone);
      form.reset(captureScheduleFields(result.action, input.timezone, result.current));
      setConfirmed(false);
    },
    change,
  );
  return { action, reviewed, timezone, confirmed, setConfirmed, form, ...reload };
}
