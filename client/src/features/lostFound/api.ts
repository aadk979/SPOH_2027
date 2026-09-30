import type { CreateLostFoundRequest, LostFoundRecord } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function createLostFound(eventId: string, body: CreateLostFoundRequest): Promise<unknown> {
  return eventApi(eventId, '/lost-found', { method: 'POST', body });
}

export interface LostFoundFilters {
  query: string;
  heldOnly: boolean;
}
export async function listLostFound(
  eventId: string,
  filters: LostFoundFilters,
): Promise<LostFoundRecord[]> {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.heldOnly) params.set('status', 'HELD');
  return (await eventApi<{ data: LostFoundRecord[] }>(eventId, `/lost-found?${params.toString()}`))
    .data;
}
export function claimLostFound(eventId: string, id: string): Promise<unknown> {
  return eventApi(eventId, `/lost-found/${id}/claim`, { method: 'POST', body: {} });
}
