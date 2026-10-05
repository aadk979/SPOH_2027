import { useEffect } from 'react';
import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Textarea } from '@/shared/ui';
import { useCaptureReview } from '../hooks/useCaptureReview';
import {
  captureActionLabel,
  captureRow,
  captureSource,
  captureValue,
  type CaptureAction,
} from '../model/captureControl';

export function CaptureChangeReview(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onClose: () => void;
  onDenied: () => void;
  onLockChange: (locked: boolean) => void;
  readUnavailable: boolean;
}) {
  const review = useCaptureReview(input);
  const locked = review.mutation.isPending || review.uncertain;
  useEffect(() => {
    input.onLockChange(locked);
  }, [input.onLockChange, locked]);
  useEffect(() => {
    if (review.denied) input.onDenied();
  }, [input.onDenied, review.denied]);
  const row = captureRow(review.reviewed);
  return (
    <div role="group" aria-label="Review capture change" className="flex flex-col gap-md">
      <p className="text-section">{captureActionLabel(input.action)}</p>
      <p>
        Reviewed capture: {captureValue(row.value)} · Selected scope version {row.storedVersion}
      </p>
      <p>{captureSource(row, review.reviewed.target.scope)}</p>
      <CaptureReviewEffect action={input.action} />
      <CaptureReviewFeedback review={review} />
      <CaptureReviewFields review={review} />
      <Button variant="quiet" disabled={locked || review.loading} onClick={input.onClose}>
        Back to capture controls
      </Button>
    </div>
  );
}
function CaptureReviewEffect({ action }: { action: CaptureAction }) {
  if (action.operation === 'set')
    return (
      <Callout>
        {action.value
          ? 'This override permits capture at this scope; the event schedule and lifecycle still apply.'
          : 'This override pauses new count and journey captures at this scope. Safety reports remain available.'}
      </Callout>
    );
  if (
    action.operation === 'restore' &&
    action.history.values.available &&
    action.history.values.operation === 'set'
  )
    return (
      <Callout>
        Historical capture: {captureValue(action.history.values.after)}. Restoring appends a new
        version and keeps earlier history.
      </Callout>
    );
  return (
    <Callout>
      This removes the selected override and uses current inheritance. Earlier inherited values are
      not reconstructed.
    </Callout>
  );
}
function CaptureReviewFeedback({ review }: { review: ReturnType<typeof useCaptureReview> }) {
  if (review.mutation.isSuccess) return <Callout role="status">Capture change applied.</Callout>;
  return (
    <>
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      {review.stale && !review.uncertain ? (
        <Callout tone="alert">Capture settings changed after your review.</Callout>
      ) : null}
      {(review.stale || review.blocked) && !review.uncertain ? (
        <Button
          variant="secondary"
          className="hover:bg-surface"
          disabled={review.loading}
          onClick={() => {
            void review.reload();
          }}
        >
          Review current capture values
        </Button>
      ) : null}
    </>
  );
}
function CaptureReviewFields({ review }: { review: ReturnType<typeof useCaptureReview> }) {
  return (
    <>
      <fieldset
        disabled={review.disabled || review.uncertain}
        className="flex min-w-0 flex-col gap-md"
      >
        <Field
          id="capture-change-reason"
          label="Reason for capture change"
          error={review.form.errors.reason}
        >
          {(props) => (
            <Textarea
              {...props}
              disabled={review.disabled || review.uncertain}
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
          disabled={review.disabled || review.uncertain}
          label="I have reviewed the current capture value and the effects of this change"
          checked={review.confirmed}
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
          ? 'Applying…'
          : review.uncertain
            ? 'Retry same capture change'
            : 'Apply capture change'}
      </Button>
    </>
  );
}
