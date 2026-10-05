import { Button, Checkbox, Field, Textarea } from '@/shared/ui';
import type { useCaptureScheduleReview } from '../hooks/useCaptureScheduleReview';
import { CaptureScheduleExecutionFields } from './CaptureScheduleExecutionFields';

export function CaptureScheduleReviewFields({
  review,
  timezone,
}: {
  review: ReturnType<typeof useCaptureScheduleReview>;
  timezone: string;
}) {
  const frozen = review.disabled || review.uncertain;
  function change<Key extends keyof typeof review.form.values>(
    key: Key,
    value: (typeof review.form.values)[Key],
  ) {
    review.form.setField(key, value);
    review.setConfirmed(false);
  }
  return (
    <>
      <fieldset disabled={frozen} className="flex min-w-0 flex-col gap-md">
        {review.action.kind !== 'cancel' ? (
          <CaptureScheduleExecutionFields review={review} timezone={timezone} />
        ) : null}
        <Field
          id="scheduled-capture-reason"
          label="Reason for capture schedule"
          error={review.form.errors.reason}
        >
          {(props) => (
            <Textarea
              {...props}
              maxLength={500}
              value={review.form.values.reason}
              onChange={(event) => change('reason', event.target.value)}
            />
          )}
        </Field>
        <Checkbox
          checked={review.confirmed}
          label="I have reviewed the current capture value, schedule and effects"
          onChange={(event) => review.setConfirmed(event.target.checked)}
        />
      </fieldset>
      <Button
        disabled={
          review.disabled ||
          (!review.uncertain && (!review.confirmed || review.form.values.reason.trim().length < 3))
        }
        onClick={review.submit}
      >
        {review.mutation.isPending
          ? 'Saving schedule…'
          : review.uncertain
            ? 'Retry same schedule request'
            : 'Confirm capture schedule'}
      </Button>
    </>
  );
}
