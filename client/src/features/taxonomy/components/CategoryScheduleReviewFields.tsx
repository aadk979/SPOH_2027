import { Button, Checkbox, Field, Textarea } from '@/shared/ui';
import type { useCategoryScheduleReview } from '../hooks/useCategoryScheduleReview';
import { CategoryScheduleExecutionFields } from './CategoryScheduleExecutionFields';

export function CategoryScheduleReviewFields({
  review,
}: {
  review: ReturnType<typeof useCategoryScheduleReview>;
}) {
  function reason(value: string) {
    review.form.setField('reason', value);
    review.setConfirmed(false);
  }
  return (
    <>
      <fieldset
        disabled={review.disabled || review.uncertain}
        className="flex min-w-0 flex-col gap-md"
      >
        {review.action.kind !== 'cancel' ? (
          <CategoryScheduleExecutionFields review={review} />
        ) : null}
        <Field
          id="scheduled-category-reason"
          label="Reason for category schedule"
          error={review.form.errors.reason}
        >
          {(props) => (
            <Textarea
              {...props}
              maxLength={500}
              value={review.form.values.reason}
              onChange={(event) => reason(event.target.value)}
            />
          )}
        </Field>
        <Checkbox
          checked={review.confirmed}
          label="I have reviewed the current category, schedule and effects"
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
          ? 'Saving category schedule…'
          : review.uncertain
            ? 'Retry same category schedule request'
            : 'Confirm category schedule'}
      </Button>
    </>
  );
}
