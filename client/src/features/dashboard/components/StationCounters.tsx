import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
export function StationCounters({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <Section title="Counters contributing">
      <BarList>
        {board.footfall.contributors.map((contributor) => (
          <BarRow
            key={contributor.volunteerId}
            label={contributor.volunteerName}
            value={contributor.value}
            max={Math.max(1, ...board.footfall.contributors.map((row) => row.value))}
          />
        ))}
      </BarList>
    </Section>
  );
}
