import type { StationSummary } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export async function listStations(): Promise<StationSummary[]> {
  return (await api<{ data: StationSummary[] }>('/stations')).data;
}
