import type { ReactNode } from 'react';
import type { FallbackWindowRecord } from '@spoh/shared';
import { Section, Card } from '@/shared/ui';
import { useEventTime } from '@/features/session';
export function ClosedFallbackWindows({ closed }: { closed: FallbackWindowRecord[] }): ReactNode {
  const format = useEventTime();
  return (
    <Section title="Closed windows">
      <ul className="flex flex-col gap-xs">
        {closed.map((window) => (
          <Card as="li" variant="flat" key={window.id}>
            <p>
              Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
              <strong>{window.durationMinutes} minutes</strong>
            </p>
            <p className="text-caption text-text-muted">
              {format.time(window.startedAt)} – {window.endedAt ? format.time(window.endedAt) : '—'}{' '}
              · {window.reason}
            </p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}
