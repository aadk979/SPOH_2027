import type { ReactNode } from 'react';
import type { StationDashboardResponse } from '@spoh/shared';
import { EmptyState, LoadingCards, PermissionDenied } from '@/shared/ui';
import { CaptureSources } from './CaptureSources';
import { StationCategories } from './StationCategories';
import { StationRoster } from './StationRoster';
import { StationCounters } from './StationCounters';
import { DeviceRegistrations } from './DeviceRegistrations';
import { StationTotals } from './StationTotals';
import { FlaggedRedemptions } from './FlaggedRedemptions';

/** One station's numbers, roster and per-device totals, or what to do before there are any. */
export function StationBoard({
  board,
  selected,
}: {
  board: StationDashboardResponse | undefined;
  selected: string | undefined;
}): ReactNode {
  if (!board) {
    return selected ? (
      <LoadingCards count={3} label="Loading station numbers" />
    ) : (
      <EmptyState title="Choose a station">
        Pick a station above to see its numbers, its roster and its per-device totals.
      </EmptyState>
    );
  }
  return (
    <>
      <StationTotals board={board} />

      <FlaggedRedemptions flagged={board.flaggedRedemptions} />
      <CaptureSources board={board} />

      <div className="grid gap-lg lg:grid-cols-2">
        {board.deviceAvailability === 'available' && board.registrations.byDevice.length > 0 ? <DeviceRegistrations board={board} /> : null}

        {board.deviceAvailability === 'available' && board.footfall.contributors.length > 0 ? <StationCounters board={board} /> : null}

        {board.rosterAvailability === 'available' ? <StationRoster board={board} /> : <PermissionDenied>Named station roster is unavailable under your current permission.</PermissionDenied>}
        {board.deviceAvailability !== 'available' ? <PermissionDenied>Named phone contributions are unavailable under your current permission. Source totals remain visible.</PermissionDenied> : null}

        <StationCategories board={board} />
      </div>
    </>
  );
}
