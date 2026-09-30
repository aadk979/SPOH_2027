import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function getLiveDashboard(eventId: string): Promise<LiveDashboardResponse> {
  return eventApi<LiveDashboardResponse>(eventId, '/dashboard/live');
}

export function getStationDashboard(
  eventId: string,
  stationId: string,
): Promise<StationDashboardResponse> {
  return eventApi<StationDashboardResponse>(eventId, `/dashboard/station/${stationId}`);
}
