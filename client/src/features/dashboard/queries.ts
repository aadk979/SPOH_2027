'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { getLiveDashboard, getStationDashboard } from './api';
import { DEFAULT_CLIENT_SETTINGS, ms } from '@/shared/lib/runtimeSettings';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';

/**
 * The live dashboard poll (BUILD_PLAN §7.3).
 *
 * Three seconds, not a WebSocket. The payload is small, there are under twenty
 * dashboard clients, and polling is dramatically simpler to operate and debug
 * on event day — which is the only day it has to work.
 */
/** Shipped default; the live cadence is a runtime setting. */
export const dashboardKeys = {
  live: (eventId: string, includeRehearsal = false) =>
    [eventId, 'dashboard', 'live', includeRehearsal] as const,
  station: (eventId: string, stationId: string | undefined, includeRehearsal = false) =>
    [eventId, 'dashboard', 'station', stationId, includeRehearsal] as const,
};

export const DASHBOARD_POLL_MS = DEFAULT_CLIENT_SETTINGS.dashboardPollSeconds * 1000;

export function useLiveDashboard(includeRehearsal = false): UseQueryResult<LiveDashboardResponse> {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allowed = useAllows()('Dashboard.ReadEvent');

  return useQuery({
    queryKey: [...dashboardKeys.live(eventId, includeRehearsal), session?.volunteerId ?? 'signed-out'],
    queryFn: ({ signal }) => getLiveDashboard(eventId, includeRehearsal, signal),
    enabled: session !== null && allowed,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    // The ops-room display is never focused. Without this it would silently
    // freeze the moment somebody clicked away from it.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useStationDashboard(
  stationId: string | undefined,
  includeRehearsal = false,
): UseQueryResult<StationDashboardResponse> {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allowed = useAllows()('Dashboard.ReadStation');

  return useQuery({
    queryKey: [...dashboardKeys.station(eventId, stationId, includeRehearsal), session?.volunteerId ?? 'signed-out'],
    queryFn: ({ signal }) => getStationDashboard(eventId, stationId ?? '', { includeRehearsal, signal }),
    enabled: session !== null && allowed && Boolean(stationId),
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    staleTime: 0,
  });
}
