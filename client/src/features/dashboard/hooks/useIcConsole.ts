import { useState } from 'react';
import { useStations } from '@/features/stations';
import { useStationDashboard } from '@/features/dashboard';
import { useAllows, useMe, useRequireSession } from '@/features/session';
import { usePendingSwaps } from '@/features/roster';
import { defaultStationId } from '../model/defaultStation';

/** The IC console's state: which station, its numbers, and the swap queue if the role decides swaps. */
export function useIcConsole() {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [stationId, setStationId] = useState<string | null>(null);
  const [includeRehearsal, setIncludeRehearsal] = useState(false);
  const stations = useStations(session !== null);
  const selected = stationId ?? defaultStationId(me);
  const dashboard = useStationDashboard(selected, includeRehearsal);
  // Only a role that decides swaps sees the queue, or asks for it (F02-020).
  const allows = useAllows();
  const canDecideSwaps = allows('Swap.Decide');
  const swaps = usePendingSwaps(session !== null && canDecideSwaps);
  return {
    session,
    stations,
    selected,
    setStationId,
    dashboard,
    canDecideSwaps,
    swaps,
    includeRehearsal,
    setIncludeRehearsal,
  };
}
