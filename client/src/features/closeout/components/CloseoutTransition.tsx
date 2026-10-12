import { useState } from 'react';
import { TransitionEventRequest, type LifecycleReadinessResponse } from '@spoh/shared';
import { useTransitionLifecycle, lifecycleBlocker } from '@/features/events';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { Button, Callout, Checkbox, Stack, ErrorState } from '@/shared/ui';

export function CloseoutTransition({
  readiness,
  to,
}: {
  readiness: LifecycleReadinessResponse;
  to: 'CLOSED' | 'ARCHIVED';
}) {
  const option = readiness.transitions.find((item) => item.to === to);
  if (!option?.allowed) {
    return (
      <Callout tone="warn">
        {option?.blockers.map((code) => <p key={code}>{lifecycleBlocker(code)}</p>) ??
          'This transition is unavailable in the current event state.'}
      </Callout>
    );
  }
  return <ConfirmedTransition readiness={readiness} to={to} />;
}

function ConfirmedTransition({
  readiness,
  to,
}: {
  readiness: LifecycleReadinessResponse;
  to: 'CLOSED' | 'ARCHIVED';
}) {
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useTransitionLifecycle();
  const receipt = useRetryKey();
  const form = useZodForm(TransitionEventRequest, {});
  const label = to === 'CLOSED' ? 'Close event' : 'Archive event';
  function submit() {
    if (!confirmed) return;
    const input = { to, expectedVersion: readiness.lifecycle.version };
    const body = form.validate({ ...input, idempotencyKey: receipt.forInput(input) });
    if (body)
      mutation.mutate(body, {
        onSuccess: () => {
          receipt.clear();
          setConfirmed(false);
        },
      });
  }
  return (
    <Stack>
      <>
        <Checkbox
          label={
            to === 'CLOSED'
              ? 'I reviewed the open cases and am ready to close capture'
              : 'I saved the export pack and reviewed archive readiness'
          }
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <Button
          variant={to === 'CLOSED' ? 'danger' : 'primary'}
          disabled={!confirmed || mutation.isPending || mutation.isSuccess}
          onClick={submit}
        >
          {label}
        </Button>
      </>
      {mutation.error ? (
        <ErrorState error={mutation.error}>Reload readiness before retrying a changed event.</ErrorState>
      ) : null}
      {mutation.isSuccess ? <p role="status">Event moved to {to.toLowerCase()}.</p> : null}
    </Stack>
  );
}
