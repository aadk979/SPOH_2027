import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { CardGrid } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
import { registrationsLink, footfallLink, recordsLink } from '../model/drillLinks';
export function StationTotals({ board }: { board: StationDashboardResponse }): ReactNode {
  return (
    <CardGrid>
      <StatTile
        label="Registered here"
          href={registrationsLink(board.observation, { stationId: board.stationId })}
        value={board.registrations.todayTotal}
        unit="registrations"
      />
      <StatTile label="Room entries" value={board.footfall.todayTotal} unit="entries, not people" href={footfallLink(board.observation, { stationId: board.stationId })} />
      <StatTile label="Cards stamped" value={board.stamps} unit="stamp rows" href={board.observation ? recordsLink({ kind: 'stamps', stationId: board.stationId, from: board.observation.from, asOf: board.asOf, includeRehearsal: board.observation.includeRehearsal }) : undefined} />
    </CardGrid>
  );
}
