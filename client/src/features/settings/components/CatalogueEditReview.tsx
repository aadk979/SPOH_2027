import { useEffect } from 'react';
import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedSettingsReadResponse,
} from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Textarea } from '@/shared/ui';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { captureSource } from '../model/captureControl';
import { catalogueValue } from '../model/operationalCatalogue';
import { catalogueProposedValue, type CatalogueEditAction } from '../model/catalogueEdit';
import { useCatalogueEdit } from '../hooks/useCatalogueEdit';
import { CatalogueProposedField } from './CatalogueProposedField';

type Review = ReturnType<typeof useCatalogueEdit>;
export function CatalogueEditReview(input: {
  current: ScopedSettingsReadResponse;
  action: CatalogueEditAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
  onClose: () => void;
  onDenied: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const review = useCatalogueEdit(input);
  const locked = review.mutation.isPending || review.uncertain;
  useEffect(() => {
    input.onLockChange(locked);
  }, [input.onLockChange, locked]);
  useEffect(() => {
    if (review.denied) input.onDenied();
  }, [input.onDenied, review.denied]);
  const row = scopedSettingRow(review.reviewed, input.action.key);
  return (
    <div role="group" aria-label="Review catalogue change" className="flex flex-col gap-md">
      <h2 className="text-section">
        {input.action.operation === 'set' ? 'Edit' : 'Remove override'} {metadata[row.key].label}
      </h2>
      <p>{metadata[row.key].description}</p>
      <p className="break-words">
        Reviewed scoped value: {catalogueValue(row.key, row.value)} · Selected scope version{' '}
        {row.storedVersion}
      </p>
      <p>
        {captureSource(row, review.reviewed.target.scope)} · Source version {row.source.version}
      </p>
      <Callout>
        {input.action.operation === 'reset'
          ? 'This removes the selected override and uses current inheritance. Earlier history is kept.'
          : 'This sets an override at the selected scope and appends a recorded version. Other scopes keep their own values.'}
      </Callout>
      {input.readUnavailable ? (
        <Callout tone="alert">
          Current catalogue values are unavailable. Fresh changes require a new read.
        </Callout>
      ) : null}
      <CatalogueEditFeedback review={review} />
      <CatalogueEditFields review={review} action={input.action} />
      <Button variant="quiet" disabled={locked || review.loading} onClick={input.onClose}>
        Back to catalogue values
      </Button>
    </div>
  );
}
function CatalogueEditFeedback({ review }: { review: Review }) {
  if (review.mutation.isSuccess) return <Callout role="status">Catalogue change applied.</Callout>;
  return (
    <>
      {review.error ? (
        <Callout tone="alert" role="alert">
          {review.error}
        </Callout>
      ) : null}
      {review.stale && !review.uncertain ? (
        <Callout tone="alert">Catalogue settings changed after your review.</Callout>
      ) : null}
      {(review.stale || review.blocked) && !review.uncertain ? (
        <Button
          variant="secondary"
          disabled={review.loading}
          onClick={() => {
            void review.reload();
          }}
        >
          Review current catalogue values
        </Button>
      ) : null}
    </>
  );
}
function CatalogueEditFields({ review, action }: { review: Review; action: CatalogueEditAction }) {
  const disabled = review.disabled || review.uncertain;
  return (
    <>
      <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-md">
        <CatalogueEditProposal review={review} action={action} />
        <Field
          id="catalogue-change-reason"
          label="Reason for catalogue change"
          error={review.form.errors.reason}
        >
          {(props) => (
            <Textarea
              {...props}
              disabled={disabled}
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
          disabled={disabled}
          label="I have reviewed the current setting and the effects of this change"
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
            ? 'Retry same catalogue change'
            : 'Apply catalogue change'}
      </Button>
    </>
  );
}
function CatalogueEditProposal({
  review,
  action,
}: {
  review: Review;
  action: CatalogueEditAction;
}) {
  if (action.operation === 'reset' || !review.field) return null;
  const proposed = catalogueProposedValue(action.key, review.form.values.proposed);
  return (
    <>
      <CatalogueProposedField
        field={review.field}
        value={review.form.values.proposed}
        error={review.form.errors.proposed}
        disabled={review.disabled || review.uncertain}
        onChange={(value) => {
          review.form.setField('proposed', value);
          review.setConfirmed(false);
        }}
      />
      {proposed !== null ? (
        <p className="break-words">Proposed scoped value: {catalogueValue(action.key, proposed)}</p>
      ) : null}
    </>
  );
}
