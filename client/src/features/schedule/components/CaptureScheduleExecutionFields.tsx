import { ChoiceGroup, Field, Input } from '@/shared/ui';
import type { useCaptureScheduleReview } from '../hooks/useCaptureScheduleReview';
import { CaptureScheduleTimePreview } from './CaptureScheduleTimePreview';

export function CaptureScheduleExecutionFields({
  review,
  timezone,
}: {
  review: ReturnType<typeof useCaptureScheduleReview>;
  timezone: string;
}) {
  return (
    <>
      <ChoiceGroup
        name="scheduled-capture-value"
        legend="Future capture value"
        value={review.form.values.value}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'paused', label: 'Paused' },
        ]}
        onChange={(value) => {
          review.form.setField('value', value);
          review.setConfirmed(false);
        }}
      />
      <Field
        id="scheduled-capture-time"
        label={`Change capture at (${timezone})`}
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
        Times use {timezone}. Repeated times use the first occurrence; skipped times move forward.
      </p>
      <CaptureScheduleTimePreview wallTime={review.form.values.wallTime} timezone={timezone} />
    </>
  );
}
