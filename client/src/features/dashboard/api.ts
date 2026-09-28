import type { LiveDashboardResponse, StationDashboardResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';

export function getLiveDashboard(): Promise<LiveDashboardResponse> {
  return api<LiveDashboardResponse>('/dashboard/live');
}

export function getStationDashboard(stationId: string): Promise<StationDashboardResponse> {
  return api<StationDashboardResponse>(`/dashboard/station/${stationId}`);
}
