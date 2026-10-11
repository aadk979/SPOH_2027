import { useState } from 'react';
import { useCloseOutLostFound } from '@/features/lostFound';
import { useAllows } from '@/features/session';
import { Button, Callout, Checkbox } from '@/shared/ui';

export function LostFoundCloseout() {
  const allows = useAllows();
  const mutation = useCloseOutLostFound();
  const [confirmed, setConfirmed] = useState(false);
  if (!allows('LostFound.CloseOut')) return <p>An authorised leader can settle lost and found.</p>;
  return (
    <>
      <p>
        Closing already marks held items unclaimed. Run this again if late items still need an
        outcome.
      </p>
      <Checkbox
        label="I reviewed held items and their custody"
        checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <Button
        variant="secondary"
        disabled={!confirmed || mutation.isPending}
        onClick={() => mutation.mutate(undefined, { onSuccess: () => setConfirmed(false) })}
      >
        Settle lost and found
      </Button>
      {mutation.error ? (
        <Callout tone="alert" role="alert">
          {mutation.error.message}
        </Callout>
      ) : null}
      {mutation.data ? (
        <p role="status">{mutation.data.markedUnclaimed} items marked unclaimed.</p>
      ) : null}
    </>
  );
}
