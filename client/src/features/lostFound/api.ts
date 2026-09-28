import type { CreateLostFoundRequest, LostFoundRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';

export function createLostFound(body: CreateLostFoundRequest): Promise<unknown> {
  return api('/lost-found', { method: 'POST', body });
}

export interface LostFoundFilters {
  query: string;
  heldOnly: boolean;
}
export async function listLostFound(filters: LostFoundFilters): Promise<LostFoundRecord[]> {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.heldOnly) params.set('status', 'HELD');
  return (await api<{ data: LostFoundRecord[] }>(`/lost-found?${params.toString()}`)).data;
}
export function claimLostFound(id: string): Promise<unknown> {
  return api(`/lost-found/${id}/claim`, { method: 'POST', body: {} });
}
