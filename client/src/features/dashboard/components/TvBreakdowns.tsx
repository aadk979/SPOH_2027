import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { TvPanel, TvRow } from './TvPrimitives';
export function TvBreakdowns({ data }: { data: LiveDashboardResponse }): ReactNode {
  return (
    <>
      <div className="grid min-h-0 flex-1 gap-[2vw] lg:grid-cols-2">
        <TvPanel title="Room entries">
          {data.footfall.stations.length === 0 ? (
            <li className="text-tv-row text-on-dark-muted">No room entries recorded yet today.</li>
          ) : (
            data.footfall.stations.map((station) => (
              <TvRow
                key={station.stationId}
                label={station.stationName}
                value={station.todayTotal}
                muted={station.silent}
                suffix={station.silent ? ' · silent' : ''}
              />
            ))
          )}
        </TvPanel>

        <TvPanel title="Who is arriving">
          {data.registrations.byCategory.length === 0 ? (
            <li className="text-tv-row text-on-dark-muted">No registrations recorded yet today.</li>
          ) : (
            data.registrations.byCategory
              .slice(0, 6)
              .map((row) => <TvRow key={row.key} label={row.label} value={row.value} />)
          )}
        </TvPanel>
      </div>
    </>
  );
}
