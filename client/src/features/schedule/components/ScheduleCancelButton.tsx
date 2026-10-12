'use client';
import type { ReactNode } from 'react';
import type { ScheduleTimelineRecord } from '@spoh/shared';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { Button, ErrorState } from '@/shared/ui';
import { cancellableHere } from '../model/producerForms';
import { useScheduleProducer } from '../queries';

/** Stops a pending lifecycle or report schedule at the version shown in the row. */
export function ScheduleCancelButton({ row }: { row: ScheduleTimelineRecord }): ReactNode {
  const produce = useScheduleProducer();
  const retry = useRetryKey();
  if (!cancellableHere(row)) return null;
  const cancel = () =>
    produce.mutate(
      {
        kind: 'cancel',
        id: row.id,
        body: {
          expectedVersion: row.version,
          idempotencyKey: retry.forInput({ id: row.id, version: row.version }),
        },
      },
      { onSuccess: retry.clear },
    );
  return (
    <>
      <Button variant="secondary" disabled={produce.isPending} onClick={cancel}>
        {produce.isPending ? 'Cancelling…' : 'Cancel this schedule'}
      </Button>
      {produce.isError ? (
        <ErrorState error={produce.error} />
      ) : null}
    </>
  );
}
