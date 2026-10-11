import { useCurrentSession, useEventTime } from '@/features/session';
import { Callout, Card } from '@/shared/ui';
import { listMySwaps } from '../api';
import { useStaffingRead } from '../queries';
import { WithdrawSwapButton } from './WithdrawSwapButton';

export function MySwapHistory() {
  const format = useEventTime();
  const session = useCurrentSession();
  const swaps = useStaffingRead('my-swaps', listMySwaps, true);
  if (swaps.isError)
    return (
      <Callout tone="alert" role="alert">
        {swaps.error.message}
      </Callout>
    );
  if (!swaps.data) return <p>Loading your requests…</p>;
  if (!swaps.data.length) return <p>No swap requests yet.</p>;
  return swaps.data.map((row) => (
    <Card key={row.id}>
      <p>
        {row.requesterName} → {row.targetName} · {row.status}
      </p>
      <p>
        {row.date} · {row.stationName} · {row.shift.label} · {format.shiftHours(row.shift)}
      </p>
      {row.reason ? <p>{row.reason}</p> : null}
      {row.status === 'REQUESTED' && row.requesterId === session?.volunteerId ? (
        <WithdrawSwapButton id={row.id} />
      ) : null}
    </Card>
  ));
}
