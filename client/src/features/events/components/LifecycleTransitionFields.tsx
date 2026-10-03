import type { EventStatus } from '@spoh/shared';
import { Button, Callout, Checkbox, Field, Select, Textarea } from '@/shared/ui';
import type { useLifecycleReview } from '../hooks/useLifecycleReview';
import { transitionLabel } from '../model/lifecycleCopy';

export function LifecycleTransitionFields({
  review,
}: {
  review: ReturnType<typeof useLifecycleReview>;
}) {
  const { form, reviewed, option } = review;
  const disabled = review.mutation.isPending || review.stale || review.saved || review.loading;
  if (!reviewed.transitions.length) return null;
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-md">
      <Field id="lifecycle-target" label="Next event state">
        {(props) => (
          <Select
            {...props}
            value={form.values.to}
            onChange={(event) => review.choose(event.target.value as EventStatus)}
          >
            {reviewed.transitions.map((item) => (
              <option key={item.to} value={item.to} disabled={!item.allowed}>
                {transitionLabel(reviewed.lifecycle.status, item.to)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {option?.allowed ? (
        <>
          <LifecycleConsequences from={reviewed.lifecycle.status} to={option.to} />
          <Field
            id="lifecycle-reason"
            label="Reason for transition"
            optional={!option.requiresReason}
            error={form.errors.reason}
          >
            {(props) => (
              <Textarea
                {...props}
                value={form.values.reason}
                maxLength={500}
                onChange={(event) => form.setField('reason', event.target.value)}
              />
            )}
          </Field>
          <Checkbox
            label="I have reviewed this transition and its effects"
            checked={review.confirmed}
            onChange={(event) => review.setConfirmed(event.target.checked)}
          />
          <Button
            variant={option.to === 'CLOSED' ? 'danger' : 'primary'}
            disabled={disabled || !review.confirmed}
            onClick={review.submit}
          >
            {review.mutation.isPending
              ? 'Applying…'
              : transitionLabel(reviewed.lifecycle.status, option.to)}
          </Button>
        </>
      ) : null}
    </fieldset>
  );
}

function LifecycleConsequences({ from, to }: { from: EventStatus; to: EventStatus }) {
  const copy =
    to === 'CLOSED'
      ? 'Closing freezes the final report, closes fallback windows and marks held found items unclaimed. Eligible pre-close offline captures retain the configured grace period.'
      : from === 'CLOSED'
        ? 'Reopening supersedes the frozen final report and cancels its archive reminder. Existing report documents are retained.'
        : to === 'REHEARSAL'
          ? 'Assigned stations open outside shift hours. New captures are practice data and are excluded from reports by default.'
          : from === 'REHEARSAL'
            ? 'Ending rehearsal closes practice fallback windows. Practice data stays labelled; new capture is paused.'
            : 'This changes the preparation state. Capture stays paused until rehearsal or go-live.';
  return <Callout>{copy}</Callout>;
}
