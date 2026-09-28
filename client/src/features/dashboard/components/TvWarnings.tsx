import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
export function TvWarnings({ data }: { data: LiveDashboardResponse }): ReactNode {
  const silent = data.dataHealth.silentStations;
  const gaps = data.staffing.gaps.length;
  return (
    <>
      {silent.length > 0 || gaps > 0 ? (
        <footer className="rounded-lg bg-tile-dark px-[1.5vw] py-[1vw] text-tv-row text-warn">
          <span aria-hidden="true">▲ </span>
          {silent.length > 0
            ? `Silent: ${silent.map((station) => station.stationName).join(', ')}. `
            : ''}
          {gaps > 0 ? `${gaps} staffing gap${gaps === 1 ? '' : 's'}.` : ''}
        </footer>
      ) : null}
    </>
  );
}
