import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function getLiveDashboard(
  eventId: string,
  includeRehearsal = false,
  signal?: AbortSignal,
): Promise<LiveDashboardResponse> {
  return eventApi<LiveDashboardResponse>(
    eventId,
    `/dashboard/live${includeRehearsal ? '?includeRehearsal=true' : ''}`,
    { signal, cache: 'no-store' },
  );
}

export function getStationDashboard(
  eventId: string,
  stationId: string,
  options: { includeRehearsal?: boolean; signal?: AbortSignal } = {},
): Promise<StationDashboardResponse> {
  return eventApi<StationDashboardResponse>(
    eventId,
    `/dashboard/station/${stationId}${options.includeRehearsal ? '?includeRehearsal=true' : ''}`,
    { signal: options.signal, cache: 'no-store' },
  );
}
