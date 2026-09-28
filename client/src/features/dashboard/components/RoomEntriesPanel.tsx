import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function RoomEntriesPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const maxStation = Math.max(1, ...data.footfall.stations.map((row) => row.todayTotal));
  return (
    <Section title="Room entries by station">
      <BarList>
        {data.footfall.stations.map((station) => (
          <BarRow
            key={station.stationId}
            label={`${station.stationName}${station.silent ? ' · silent' : ''}`}
            value={station.todayTotal}
            max={maxStation}
            muted={station.silent}
          />
        ))}
      </BarList>
    </Section>
  );
}
