import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
import { formatTime } from '@/shared/lib/format';
export function FootfallSection({ data }: { data: FullReport }): ReactNode {
  return (
    <Section title="Room entries and peak periods">
      <BarList>
        {data.footfall.byStation.length === 0 ? (
          <p className="text-text-muted">Nothing recorded.</p>
        ) : (
          data.footfall.byStation.map((row) => (
            <div key={row.stationId}>
              <BarRow
                label={row.stationName}
                value={row.total}
                max={Math.max(1, ...data.footfall.byStation.map((entry) => entry.total))}
              />
              {row.peakBlockStart ? (
                // Under its own bar, not at a fixed 160px indent that
                // landed under the neighbouring station on a phone.
                <p className="mt-xxs text-caption text-text-muted">
                  Busiest 30 minutes: {formatTime(row.peakBlockStart)} · {row.peakBlockValue}{' '}
                  entries
                </p>
              ) : null}
            </div>
          ))
        )}
      </BarList>
    </Section>
  );
}
