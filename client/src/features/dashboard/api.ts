import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function getLiveDashboard(
  eventId: string,
  includeRehearsal = false,
): Promise<LiveDashboardResponse> {
  return eventApi<LiveDashboardResponse>(
    eventId,
    `/dashboard/live${includeRehearsal ? '?includeRehearsal=true' : ''}`,
  );
}

export function getStationDashboard(
  eventId: string,
  stationId: string,
  includeRehearsal = false,
): Promise<StationDashboardResponse> {
  return eventApi<StationDashboardResponse>(
    eventId,
    `/dashboard/station/${stationId}${includeRehearsal ? '?includeRehearsal=true' : ''}`,
  );
}
