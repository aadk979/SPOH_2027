'use client';
import type { CardPrintContextRecord } from '@spoh/shared';
import { Button, Callout, Card, LoadingRows } from '@/shared/ui';
import { useCardPrintDetails, useCardPrintDownload } from '../queries';
import { usePrintAccessFailure } from '../hooks/usePrintAccessFailure';

function FrozenPrintContext({ context }: { context: CardPrintContextRecord | null }) {
  if (!context) return <p>This older export has no saved print context.</p>;
  return (
    <>
      <p>Frozen event name: {context.eventName}</p>
      <p>
        Stamping stations:{' '}
        {context.stampingStations.map((station) => station.name).join(', ') || 'None'}
      </p>
      <ul>
        {context.batches.map((batch) => (
          <li key={batch.shortCode}>
            {batch.shortCode}: {batch.batchLabel ?? 'No batch label'}
          </li>
        ))}
      </ul>
    </>
  );
}
export function CardPrintDetails({ id, onAccessLost }: { id: string; onAccessLost: () => void }) {
  const detail = useCardPrintDetails(id);
  const download = useCardPrintDownload();
  const data = detail.data;
  usePrintAccessFailure(detail.error ?? download.error, onAccessLost);
  return (
    <Card>
      <h3>Stored export details</h3>
      {detail.isPending ? <LoadingRows label="Loading print details" /> : null}
      {detail.error ? (
        <Callout role="alert" tone="alert">
          Export details are unavailable.
          <Button variant="quiet" onClick={() => void detail.refetch()}>
            Retry export details
          </Button>
        </Callout>
      ) : null}
      {data && !detail.isError ? (
        <>
          <p>
            {data.format.toUpperCase()} · {data.count} {data.rehearsal ? 'rehearsal' : 'live'} cards
          </p>
          <p>
            {data.shortCodes.length
              ? `Printed codes: ${data.shortCodes.join(', ')}`
              : 'This older export has no saved card membership.'}
          </p>
          <FrozenPrintContext context={data.printContext} />
          <Button disabled={download.isPending} onClick={() => download.mutate(data)}>
            Download stored {data.format.toUpperCase()}
          </Button>
          {download.error ? (
            <Callout role="alert" tone="alert">
              Could not download this stored print file. Try again.
            </Callout>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
