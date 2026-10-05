import { useEffect } from 'react';
import { Button, Callout } from '@/shared/ui';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { useCaptureScheduleReview } from '../hooks/useCaptureScheduleReview';
import type { CaptureScheduleReviewInput } from '../model/captureScheduleControls';
import { CaptureScheduleReviewFields } from './CaptureScheduleReviewFields';
import { scheduleStatusLabels } from '../model/copy';
import { useEventTime } from '@/features/session';

export function CaptureScheduleReview(
  input: CaptureScheduleReviewInput & {
    onClose: () => void;
    onDenied: () => void;
    onLockChange: (locked: boolean) => void;
  },
) {
  const review = useCaptureScheduleReview(input);
  useEffect(() => {
    input.onLockChange(review.locked);
  }, [input.onLockChange, review.locked]);
  useEffect(() => {
    if (review.denied) input.onDenied();
  }, [input.onDenied, review.denied]);
  const row = scopedSettingRow(review.reviewed, 'capture.open');
  return (
    <div role="group" aria-label="Review capture schedule" className="flex flex-col gap-md">
      <h4 className="text-section">
        {review.action.kind === 'create'
          ? 'Schedule a capture change'
          : review.action.kind === 'edit'
            ? 'Edit capture schedule'
            : 'Cancel capture schedule'}
      </h4>
      <p>
        Reviewed capture: {row.value === true ? 'Open' : 'Paused'} · Selected scope version{' '}
        {row.storedVersion}
      </p>
      {review.action.kind !== 'create' ? (
        <p>
          Reviewed schedule version {review.action.schedule.version} ·{' '}
          {scheduleStatusLabels[review.action.schedule.status]}
        </p>
      ) : null}
      <Callout>
        {review.action.kind === 'cancel'
          ? 'Cancellation stops this pending action. It does not change capture settings.'
          : 'Scheduling saves a future override. Capture changes only if the reviewed value, creator permission and event lifecycle still allow it when the action runs. Safety reports remain available.'}
      </Callout>
      <CaptureScheduleReviewFeedback review={review} />
      <CaptureScheduleReviewFields review={review} timezone={review.timezone} />
      <Button variant="quiet" disabled={review.locked || review.loading} onClick={input.onClose}>
        Back to capture schedules
      </Button>
    </div>
  );
}
function CaptureScheduleReviewFeedback({
  review,
}: {
  review: ReturnType<typeof useCaptureScheduleReview>;
}) {
  const clock = useEventTime();
  if (review.mutation.isSuccess)
    return (
      <Callout role="status">
        <p>
          Schedule request confirmed. Current status:{' '}
          {scheduleStatusLabels[review.mutation.data.schedule.status]} · Version{' '}
          {review.mutation.data.schedule.version}.
        </p>
        <p>
          Current scheduled capture: {review.mutation.data.schedule.value ? 'Open' : 'Paused'} ·{' '}
          {clock.dateTime(review.mutation.data.schedule.scheduledFor)}
        </p>
      </Callout>
    );
  return (
    <>
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      {review.stale && !review.uncertain ? (
        <Callout tone="alert">Schedule or capture settings changed after your review.</Callout>
      ) : null}
      {!review.uncertain && (review.stale || review.blocked) ? (
        <Button variant="secondary" disabled={review.loading} onClick={() => void review.reload()}>
          Review current schedule and capture values
        </Button>
      ) : null}
    </>
  );
}
