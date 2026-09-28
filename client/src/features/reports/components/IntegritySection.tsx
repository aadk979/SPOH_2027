import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Card, CardTitle } from '@/shared/ui';
export function IntegritySection({ data }: { data: FullReport }): ReactNode {
  return data.dataIntegrity.containsFallbackData ? (
    <Card tone="warn">
      <CardTitle>This report contains data captured off-app</CardTitle>
      <p className="mt-xs">
        {data.dataIntegrity.degradedMinutes} minutes of degraded operation across{' '}
        {data.dataIntegrity.fallbackWindows.length} window
        {data.dataIntegrity.fallbackWindows.length === 1 ? '' : 's'}. Those periods are approximate.
      </p>
      <ul className="mt-xs flex flex-col gap-xxs text-caption text-text-muted">
        {data.dataIntegrity.fallbackWindows.map((window) => (
          <li key={window.id}>
            Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
            {window.durationMinutes ?? '—'} min · {window.reason}
          </li>
        ))}
      </ul>
    </Card>
  ) : null;
}
