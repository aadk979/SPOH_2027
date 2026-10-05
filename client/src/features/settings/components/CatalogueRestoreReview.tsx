import { useEffect } from 'react';
import {
  GENERATED_SETTING_METADATA as metadata,
  type ScopedSettingsReadResponse,
  type ScopedSettingsHistoryRecord,
} from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Textarea } from '@/shared/ui';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { captureSource } from '../model/captureControl';
import { catalogueValue } from '../model/operationalCatalogue';
import { useCatalogueRestore } from '../hooks/useCatalogueRestore';

export function CatalogueRestoreReview(input: {
  current: ScopedSettingsReadResponse;
  history: ScopedSettingsHistoryRecord;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
  onClose: () => void;
  onDenied: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const review = useCatalogueRestore(input);
  const locked = review.mutation.isPending || review.uncertain;
  useEffect(() => {
    input.onLockChange(locked);
  }, [input.onLockChange, locked]);
  useEffect(() => {
    if (review.denied) input.onDenied();
  }, [input.onDenied, review.denied]);
  const row = scopedSettingRow(review.reviewed, input.history.key);
  return (
    <div role="group" aria-label="Review catalogue restore" className="flex flex-col gap-md">
      <h2 className="text-section">
        Restore {metadata[row.key].label} · Historical version {input.history.version}
      </h2>
      <p>{metadata[row.key].description}</p>
      <p className="break-words">
        Reviewed scoped value: {catalogueValue(row.key, row.value)} · Selected scope version{' '}
        {row.storedVersion}
      </p>
      <p>
        {captureSource(row, review.reviewed.target.scope)} · Source version {row.source.version}
      </p>
      <CatalogueRestoreEffect history={input.history} />
      {input.readUnavailable ? (
        <Callout tone="alert">
          Current catalogue values are unavailable. Fresh restores require a new read.
        </Callout>
      ) : null}
      <CatalogueRestoreFeedback review={review} />
      <CatalogueRestoreFields review={review} />
      <Button variant="quiet" disabled={locked || review.loading} onClick={input.onClose}>
        Back to catalogue history
      </Button>
    </div>
  );
}
function CatalogueRestoreEffect({ history }: { history: ScopedSettingsHistoryRecord }) {
  if (!history.values.available)
    return <Callout tone="alert">This historical value is unavailable.</Callout>;
  return (
    <Callout>
      {history.values.operation === 'set' ? (
        <>
          Historical scoped value: {catalogueValue(history.key, history.values.after)}. Restoring
          appends a new version and keeps earlier history.
        </>
      ) : (
        'This removes the selected override and uses current inheritance. Earlier inherited values are not reconstructed.'
      )}
    </Callout>
  );
}
function CatalogueRestoreFeedback({ review }: { review: ReturnType<typeof useCatalogueRestore> }) {
  if (review.mutation.isSuccess) return <Callout role="status">Catalogue restore applied.</Callout>;
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
function CatalogueRestoreFields({ review }: { review: ReturnType<typeof useCatalogueRestore> }) {
  return (
    <>
      <fieldset
        disabled={review.disabled || review.uncertain}
        className="flex min-w-0 flex-col gap-md"
      >
        <Field
          id="catalogue-restore-reason"
          label="Reason for catalogue restore"
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
          label="I have reviewed the current setting and the effects of this restore"
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
          ? 'Restoring…'
          : review.uncertain
            ? 'Retry same catalogue restore'
            : 'Restore catalogue setting'}
      </Button>
    </>
  );
}
