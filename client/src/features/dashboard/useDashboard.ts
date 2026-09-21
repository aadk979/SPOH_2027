'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { api } from '@/lib/api';
import { DEFAULT_CLIENT_SETTINGS, ms } from '@/lib/runtimeSettings';
import { useCurrentSession } from '../session/useSession';

/**
 * The live dashboard poll (BUILD_PLAN §7.3).
 *
 * Three seconds, not a WebSocket. The payload is small, there are under twenty
 * dashboard clients, and polling is dramatically simpler to operate and debug
 * on event day — which is the only day it has to work.
 */
/** Shipped default; the live cadence is a runtime setting. */
export const DASHBOARD_POLL_MS = DEFAULT_CLIENT_SETTINGS.dashboardPollSeconds * 1000;

export function useLiveDashboard(): UseQueryResult<LiveDashboardResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['dashboard', 'live'],
    queryFn: () => api<LiveDashboardResponse>('/dashboard/live'),
    enabled: session !== null,
    refetchInterval: ms.dashboardPoll(),
    // The ops-room display is never focused. Without this it would silently
    // freeze the moment somebody clicked away from it.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useStationDashboard(
  stationId: string | undefined,
): UseQueryResult<StationDashboardResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['dashboard', 'station', stationId],
    queryFn: () => api<StationDashboardResponse>(`/dashboard/station/${stationId ?? ''}`),
    enabled: session !== null && Boolean(stationId),
    refetchInterval: ms.dashboardPoll(),
    staleTime: 0,
  });
}
