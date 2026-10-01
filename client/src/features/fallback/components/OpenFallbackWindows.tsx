import type { ReactNode } from 'react';
import type { FallbackWindowRecord } from '@spoh/shared';
import type { FallbackController } from '../hooks/useFallbackScreen';
import { Card, CardTitle, Button } from '@/shared/ui';
import { useEventTime } from '@/features/session';
export function OpenFallbackWindows({
  open,
  close,
}: {
  open: FallbackWindowRecord[];
  close: FallbackController['close'];
}): ReactNode {
  const format = useEventTime();
  return (
    <Card tone="warn" as="section" aria-label="Open fallback windows">
      <CardTitle>
        {open.length} fallback window{open.length === 1 ? '' : 's'} open
      </CardTitle>

      <ul className="mt-sm flex flex-col gap-md">
        {open.map((window) => (
          <li key={window.id}>
            {window.rehearsal ? (
              <p className="text-caption font-semibold">REHEARSAL · Practice window</p>
            ) : null}
            <p>
              <strong>Tier {window.tier}</strong>{' '}
              {window.tier === 4 ? '(paper pack)' : '(Google fallback pack)'} ·{' '}
              {window.stationName ?? 'Event-wide'}
            </p>
            <p className="text-caption text-text-muted">
              Since {format.time(window.startedAt)} · declared by {window.declaredByName} ·{' '}
              {window.reason}
            </p>
            <Button
              className="mt-xs"
              disabled={close.isPending}
              onClick={() => close.mutate(window.id)}
              aria-label={`Close the Tier ${window.tier} window for ${window.stationName ?? 'the whole event'}`}
            >
              Close this window
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
