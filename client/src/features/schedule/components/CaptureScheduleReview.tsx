import { useEffect } from 'react';
import { Button, Callout } from '@/shared/ui';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { useCaptureScheduleReview } from '../hooks/useCaptureScheduleReview';
import type { CaptureScheduleReviewInput } from '../model/captureScheduleControls';
import { CaptureScheduleReviewFields } from './CaptureScheduleReviewFields';
import { scheduleStatusLabels } from '../model/copy';
import { useEventTime } from '@/features/session';
import { captureScheduleKey } from '../model/captureScheduleReview';
import { GENERATED_SETTING_METADATA as metadata } from '@spoh/shared';
import { scheduledSettingValue, settingScheduleCopy } from '../model/settingScheduleCopy';

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
  const settingKey = captureScheduleKey(review.action);
  const copy = settingScheduleCopy(settingKey);
  const row = scopedSettingRow(review.reviewed, settingKey);
  return (
    <div role="group" aria-label={`Review ${copy.noun} schedule`} className="flex flex-col gap-md">
      <h4 className="text-section">
        {review.action.kind === 'create'
          ? settingKey === 'capture.open'
            ? 'Schedule a capture change'
            : `Schedule ${metadata[settingKey].label}`
          : review.action.kind === 'edit'
            ? `Edit ${copy.noun} schedule`
            : `Cancel ${copy.noun} schedule`}
      </h4>
      <p>
        Reviewed {settingKey === 'capture.open' ? 'capture' : metadata[settingKey].label}:{' '}
        {settingKey === 'capture.open'
          ? row.value === true
            ? 'Open'
            : 'Paused'
          : JSON.stringify(row.value)}{' '}
        · Selected scope version {row.storedVersion}
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
          : `Scheduling saves a future override. The setting changes only if the reviewed version, creator permission and event lifecycle still allow it when the action runs.`}
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
          Current scheduled {settingScheduleCopy(review.mutation.data.schedule.key).noun}:{' '}
          {scheduledSettingValue(
            review.mutation.data.schedule.key,
            review.mutation.data.schedule.value,
          )}{' '}
          · {clock.dateTime(review.mutation.data.schedule.scheduledFor)}
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
