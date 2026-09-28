import type { ReactNode } from 'react';
import type { FallbackWindowRecord } from '@spoh/shared';
import { Section, Card } from '@/shared/ui';
import { formatTime } from '@/shared/lib/format';
export function ClosedFallbackWindows({ closed }: { closed: FallbackWindowRecord[] }): ReactNode {
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
              {formatTime(window.startedAt)} – {window.endedAt ? formatTime(window.endedAt) : '—'} ·{' '}
              {window.reason}
            </p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}
