import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { CardGrid } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function StationTotals({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <CardGrid>
      <StatTile
        label="Registered here"
        value={board.registrations.todayTotal}
        unit="registrations"
      />
      <StatTile label="Room entries" value={board.footfall.todayTotal} unit="entries, not people" />
      <StatTile label="Cards stamped" value={board.stamps} unit="stamps" />
    </CardGrid>
  );
}
