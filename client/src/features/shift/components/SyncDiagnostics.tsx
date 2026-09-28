import type { ReactNode } from 'react';
import type { SyncDiagnosticsState } from '../hooks/useSyncDiagnostics';
import { Button, Callout, Card, Section } from '@/shared/ui';
import { flush } from '@/shared/lib/outbox';
import { formatTime } from '@/shared/lib/format';
export function SyncDiagnostics({ state }: { state: SyncDiagnosticsState }): ReactNode {
  const { entries, failed, pending, copied, copyError, copyFailed } = state;
  return (
    <Section title="Sync">
      {entries.length === 0 ? (
        <Callout tone="ok">Everything you have captured has reached the server.</Callout>
      ) : (
        <Card variant="flat">
          <p>
            <strong>{pending.length}</strong> waiting to send, <strong>{failed.length}</strong>{' '}
            could not be sent.
          </p>

          <div className="mt-md flex flex-wrap gap-sm">
            <Button onClick={() => void flush({ force: true })}>Try again now</Button>

            {failed.length > 0 ? (
              <Button variant="quiet" onClick={() => void copyFailed()}>
                {copied ? 'Copied ✓' : 'Copy failed captures'}
              </Button>
            ) : null}
          </div>

          {copyError ? (
            <Callout tone="alert" role="alert" className="mt-md">
              Could not copy automatically. Select the list below by hand and copy it instead.
            </Callout>
          ) : null}

          {failed.length > 0 ? (
            <>
              <p className="mt-lg text-caption text-text-muted">
                Give these to your IC to enter on the fallback sheet. They paste straight into a
                spreadsheet.
              </p>

              {/*
                    Scrolls inside itself. An hour of failed taps is hundreds of
                    rows, and letting them run down the page buries the "Try
                    again" button the volunteer came here to press.
                  */}
              <ul className="mt-xs flex max-h-[40dvh] flex-col gap-xxs overflow-y-auto text-caption text-text-muted">
                {failed.map((entry) => (
                  <li key={entry.id}>
                    {formatTime(entry.clientRecordedAt)} · {entry.endpoint} · {entry.attempts}{' '}
                    attempts · {entry.lastError ?? 'unknown error'}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      )}
    </Section>
  );
}
