'use client';
import { useCallback, useState } from 'react';
import { useAllows, useCurrentSession, useEventTime } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { Button, Callout, EmptyState, LoadingRows, Stack, ErrorState } from '@/shared/ui';
import { useCardPrintHistory } from '../queries';
import { usePrintAccessFailure } from '../hooks/usePrintAccessFailure';
import { CardPrintDetails } from './CardPrintDetails';

function PrintHistoryStatus({
  query,
  empty,
}: {
  query: ReturnType<typeof useCardPrintHistory>;
  empty: boolean;
}) {
  if (query.isPending) return <LoadingRows label="Loading print exports" />;
  if (query.error)
    return (
      <ErrorState error={query.error}>Print history is unavailable.
        <Button variant="quiet" onClick={() => void query.refetch()}>
          Retry print history
        </Button></ErrorState>
    );
  return empty ? (
    <EmptyState title="No print exports yet">
      Stored files appear here after a print export is prepared.
    </EmptyState>
  ) : null;
}
export function CardPrintHistory() {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allows = useAllows();
  return session && allows('Report.Export') ? (
    <PrintHistoryOwner key={`${eventId}:${session.volunteerId}`} />
  ) : null;
}
function PrintHistoryOwner() {
  const [denied, setDenied] = useState(false);
  const onAccessLost = useCallback(() => setDenied(true), []);
  return denied ? (
    <Callout role="alert" tone="alert">
      Print export access is unavailable. Reload your session.
    </Callout>
  ) : (
    <PrintHistoryReader onAccessLost={onAccessLost} />
  );
}
function PrintHistoryReader({ onAccessLost }: { onAccessLost: () => void }) {
  const history = useCardPrintHistory();
  const clock = useEventTime();
  const [selected, setSelected] = useState<string | null>(null);
  usePrintAccessFailure(history.error, onAccessLost);
  const records = history.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Stack>
      <p>Stored print files remain available after refresh and event archive.</p>
      <PrintHistoryStatus query={history} empty={records.length === 0} />
      {!history.isError
        ? records.map((record) => (
            <article key={record.id}>
              <h3>
                {record.format.toUpperCase()} · {record.count}{' '}
                {record.rehearsal ? 'rehearsal' : 'live'} cards
              </h3>
              <p>{clock.dateTime(record.createdAt)}</p>
              <Button variant="secondary" onClick={() => setSelected(record.id)}>
                View export {record.id}
              </Button>
            </article>
          ))
        : null}
      {history.hasNextPage && !history.isError ? (
        <Button
          variant="quiet"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load older print exports
        </Button>
      ) : null}
      {selected && !history.isError ? (
        <CardPrintDetails key={selected} id={selected} onAccessLost={onAccessLost} />
      ) : null}
    </Stack>
  );
}
