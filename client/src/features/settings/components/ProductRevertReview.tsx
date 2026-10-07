import type { EventSettingHistoryRecord, EventSettingsResponse } from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Textarea } from '@/shared/ui';
import { useProductRevertReview } from '../hooks/useProductRevertReview';
import {
  productRevertWarning,
  productSettingLabels,
  productValueLabel,
} from '../model/productHistory';

export function ProductRevertReview(input: {
  target: EventSettingHistoryRecord;
  current: EventSettingsResponse;
  stations: ReadonlyArray<{ id: string; name: string }>;
  loadCurrent: () => Promise<EventSettingsResponse | null>;
  onClose: () => void;
}) {
  const review = useProductRevertReview(input);
  const { target } = input;
  if (review.denied)
    return (
      <Callout tone="alert" role="alert">
        {review.error}
      </Callout>
    );
  if (!target.values.available) return null;
  const warning = productRevertWarning(target, review.reviewed.settings);
  return (
    <div className="flex flex-col gap-md" role="group" aria-label="Review setting restore">
      <p className="text-section">Restore {productSettingLabels[target.key].toLowerCase()}</p>
      <p>
        Current version {review.reviewed.versions[target.key]}:{' '}
        {productValueLabel(review.reviewed.settings[target.key], input.stations)}
      </p>
      <p>
        Historical version {target.version}:{' '}
        {productValueLabel(target.values.after, input.stations)}
      </p>
      <Callout>A restore appends a new version. Earlier history stays unchanged.</Callout>
      {warning ? <Callout tone="alert">{warning}</Callout> : null}
      <ProductRevertFeedback review={review} />
      <ProductRevertFields review={review} />
      <Button
        variant="quiet"
        disabled={review.mutation.isPending || review.loading}
        onClick={input.onClose}
      >
        Back to history
      </Button>
    </div>
  );
}
function ProductRevertFeedback({ review }: { review: ReturnType<typeof useProductRevertReview> }) {
  if (review.mutation.isSuccess)
    return <Callout role="status">Setting restored successfully as a new version.</Callout>;
  return (
    <>
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      {review.stale ? (
        <Callout tone="alert" role="alert">
          This setting changed after your review.
        </Callout>
      ) : null}
      {review.stale || review.blocked ? (
        <Button
          variant="secondary"
          className="hover:bg-surface"
          disabled={review.loading}
          onClick={() => {
            void review.reload();
          }}
        >
          Review current values
        </Button>
      ) : null}
    </>
  );
}
function ProductRevertFields({ review }: { review: ReturnType<typeof useProductRevertReview> }) {
  return (
    <fieldset disabled={review.disabled} className="flex min-w-0 flex-col gap-md">
      <Field
        id="setting-revert-reason"
        label="Reason for restoring"
        error={review.form.errors.reason}
      >
        {(props) => (
          <Textarea
            {...props}
            value={review.form.values.reason}
            maxLength={500}
            onChange={(event) => {
              review.form.setField('reason', event.target.value);
              review.setConfirmed(false);
            }}
          />
        )}
      </Field>
      <Checkbox
        label="I have reviewed the current value and the effects of restoring this version"
        checked={review.confirmed}
        onChange={(event) => review.setConfirmed(event.target.checked)}
      />
      <Button
        disabled={
          review.disabled || !review.confirmed || review.form.values.reason.trim().length < 3
        }
        onClick={review.submit}
      >
        {review.mutation.isPending ? 'Restoring…' : 'Restore this version'}
      </Button>
    </fieldset>
  );
}
