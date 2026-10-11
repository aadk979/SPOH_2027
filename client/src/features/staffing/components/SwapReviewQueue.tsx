import { DecideSwapRequest, type SwapRequestRecord } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { useEventTime } from '@/features/session';
import { Button, Callout, Card, Field, Select, Stack, Textarea } from '@/shared/ui';
import { listStaffingPendingSwaps, reviewSwap } from '../api';
import { useStaffingRead, useStaffingWrite } from '../queries';
import { MutationFeedback } from './MutationFeedback';

export function SwapReviewQueue() {
  const queue = useStaffingRead('pending-swaps', listStaffingPendingSwaps, true);
  if (queue.isError)
    return (
      <Callout tone="alert" role="alert">
        {queue.error.message}
      </Callout>
    );
  if (queue.isPending) return <p>Loading requests…</p>;
  return (
    <Stack>
      {queue.data.length ? (
        queue.data.map((row) => <SwapDecision key={row.id} row={row} />)
      ) : (
        <p>No swaps await review.</p>
      )}
    </Stack>
  );
}

function SwapDecision({ row }: { row: SwapRequestRecord }) {
  const receipt = useRetryKey();
  const form = useZodForm(DecideSwapRequest, {
    decision: 'APPROVED' as 'APPROVED' | 'REJECTED',
    note: '',
  });
  const mutation = useStaffingWrite(reviewSwap);
  const format = useEventTime();
  function decide() {
    const body = form.validate({ ...form.values, idempotencyKey: receipt.forInput(form.values) });
    if (body) mutation.mutate({ id: row.id, body }, { onSuccess: receipt.clear });
  }
  return (
    <Card>
      <p className="font-semibold">
        {row.requesterName} → {row.targetName}
      </p>
      <p>
        {row.date} · {row.stationName} · {row.shift.label} · {format.shiftHours(row.shift)}
      </p>
      {row.reason ? <p>Reason: {row.reason}</p> : null}
      <Field id={`decision-${row.id}`} label="Decision" error={form.errors.decision}>
        {(props) => (
          <Select
            {...props}
            value={form.values.decision}
            onChange={(event) =>
              form.setField('decision', event.target.value as 'APPROVED' | 'REJECTED')
            }
          >
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
          </Select>
        )}
      </Field>
      <Field id={`note-${row.id}`} label="Decision note" optional error={form.errors.note}>
        {(props) => (
          <Textarea
            {...props}
            value={form.values.note}
            onChange={(event) => form.setField('note', event.target.value)}
          />
        )}
      </Field>
      <Button disabled={mutation.isPending} onClick={decide}>
        Save decision
      </Button>
      <MutationFeedback error={mutation.error} saved={mutation.isSuccess} />
    </Card>
  );
}
