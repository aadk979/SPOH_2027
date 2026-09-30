import type { StationSummary } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function listStations(eventId: string): Promise<StationSummary[]> {
  return (await eventApi<{ data: StationSummary[] }>(eventId, '/stations')).data;
}
