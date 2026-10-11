import { useState } from 'react';
import type { EventDayRecord } from '@spoh/shared';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, Callout, Checkbox, Stack } from '@/shared/ui';
import { useDayRemoval } from '../queries';
export function RemoveDay({ day }: { day: EventDayRecord }) {
  const [confirmed, setConfirmed] = useState(false);
  const retry = useRetryKey();
  const remove = useDayRemoval();
  return (
    <Stack>
      <Callout tone="info">
        Remove only a mistaken, unused day. The server refuses removal after any event capture, or
        while this day has roster, briefing, attendance or announcement records.
      </Callout>
      <Checkbox
        label={`Remove ${day.label} (${day.date}) and its empty shifts`}
        checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <Button
        variant="danger"
        disabled={!confirmed || remove.isPending}
        onClick={() =>
          remove.mutate(
            { id: day.id, body: { idempotencyKey: retry.forInput(day.id) } },
            { onSuccess: retry.clear },
          )
        }
      >
        Remove unused day
      </Button>
      {remove.error ? (
        <Callout tone="alert" role="alert">
          {remove.error.message}
        </Callout>
      ) : null}
    </Stack>
  );
}
