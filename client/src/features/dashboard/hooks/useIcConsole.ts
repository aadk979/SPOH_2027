import { useState } from 'react';
import { useStations } from '@/features/stations';
import { useStationDashboard } from '@/features/dashboard';
import { useMe, useRequireSession } from '@/features/session';
import { usePendingSwaps } from '@/features/roster';
import { defaultStationId } from '../model/defaultStation';

/** The IC console's state: which station, its numbers, and the swap queue if the role decides swaps. */
export function useIcConsole() {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [stationId, setStationId] = useState<string | null>(null);
  const stations = useStations(session !== null);
  const selected = stationId ?? defaultStationId(me);
  const dashboard = useStationDashboard(selected);
  // Only a role that decides swaps sees the queue, or asks for it (F02-020).
  const canDecideSwaps = me?.capabilities.includes('swap.approve') ?? false;
  const swaps = usePendingSwaps(session !== null && canDecideSwaps);
  return { session, stations, selected, setStationId, dashboard, canDecideSwaps, swaps };
}
