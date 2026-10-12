import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { Section } from '@/shared/ui';
import { BarList, BarRow } from '@/features/dashboard';
import { footfallLink } from '../model/drillLinks';
export function StationCounters({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <Section title="Counters contributing">
      <BarList>
        {board.footfall.contributors.map((contributor) => (
          <BarRow
            key={contributor.volunteerId}
            href={footfallLink(board.observation, { stationId: board.stationId, personId: contributor.volunteerId, source: 'APP' })}
            label={contributor.volunteerName}
            value={contributor.value}
            max={Math.max(1, ...board.footfall.contributors.map((row) => row.value))}
          />
        ))}
      </BarList>
    </Section>
  );
}
