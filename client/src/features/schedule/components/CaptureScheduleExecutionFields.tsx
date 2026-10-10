import { ChoiceGroup, Field, Input } from '@/shared/ui';
import type { useCaptureScheduleReview } from '../hooks/useCaptureScheduleReview';
import { CaptureScheduleTimePreview } from './CaptureScheduleTimePreview';
import { captureScheduleKey } from '../model/captureScheduleReview';
import { catalogueField } from '@/shared/lib/settingField';
import { CatalogueProposedField } from '@/shared/forms/SettingProposedField';

export function CaptureScheduleExecutionFields({
  review,
  timezone,
}: {
  review: ReturnType<typeof useCaptureScheduleReview>;
  timezone: string;
}) {
  const key = captureScheduleKey(review.action);
  const field = catalogueField(key);
  const changeValue = (value: typeof review.form.values.value) => {
    review.form.setField('value', value);
    review.setConfirmed(false);
  };
  return (
    <>
      {key === 'capture.open' ? (
        <ChoiceGroup
          name="scheduled-capture-value"
          legend="Future capture value"
          value={typeof review.form.values.value === 'string' ? review.form.values.value : 'paused'}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'paused', label: 'Paused' },
          ]}
          onChange={(value) => {
            review.form.setField('value', value);
            review.setConfirmed(false);
          }}
        />
      ) : field ? (
        <CatalogueProposedField
          field={field}
          value={review.form.values.value}
          error={review.form.errors.value}
          disabled={review.disabled || review.uncertain}
          onChange={changeValue}
        />
      ) : null}
      <Field
        id="scheduled-capture-time"
        label={`Change ${key === 'capture.open' ? 'capture' : 'setting'} at (${timezone})`}
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
