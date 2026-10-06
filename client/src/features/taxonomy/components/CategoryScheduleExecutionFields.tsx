import { ChoiceGroup, Field, Input } from '@/shared/ui';
import type { useCategoryScheduleReview } from '../hooks/useCategoryScheduleReview';
import { CategoryScheduleTimePreview } from './CategoryScheduleTimePreview';

export function CategoryScheduleExecutionFields({
  review,
}: {
  review: ReturnType<typeof useCategoryScheduleReview>;
}) {
  return (
    <>
      <ChoiceGroup
        name="scheduled-category-state"
        legend="Scheduled category state"
        value={review.form.values.active}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
        onChange={(value) => {
          review.form.setField('active', value);
          review.setConfirmed(false);
        }}
      />
      <Field
        id="scheduled-category-time"
        label={`Change category at (${review.timezone})`}
        error={review.form.errors.wallTime}
      >
        {(props) => (
          <Input
            {...props}
            type="datetime-local"
            value={review.form.values.wallTime}
            onChange={(event) => {
              review.form.setField('wallTime', event.target.value);
              review.setConfirmed(false);
            }}
          />
        )}
      </Field>
      <p className="text-caption">
        Times use {review.timezone}. Repeated times use the first occurrence; skipped times move
        forward.
      </p>
      <CategoryScheduleTimePreview
        wallTime={review.form.values.wallTime}
        timezone={review.timezone}
      />
    </>
  );
}
