import type { FallbackWindowRecord, DeclareFallbackRequest, ImportResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function listFallbackWindows(eventId: string): Promise<FallbackWindowRecord[]> {
  return (await eventApi<{ data: FallbackWindowRecord[] }>(eventId, '/fallback/windows')).data;
}
export function declareFallback(eventId: string, body: DeclareFallbackRequest): Promise<unknown> {
  return eventApi(eventId, '/fallback/windows', { method: 'POST', body });
}
export function closeFallback(eventId: string, id: string): Promise<unknown> {
  return eventApi(eventId, `/fallback/windows/${id}/close`, { method: 'POST', body: {} });
}
export interface FallbackImport {
  source: 'FALLBACK_SHEET' | 'PAPER';
  rows: Array<Record<string, unknown>>;
  commit: boolean;
  fileName?: string;
  rehearsal?: boolean;
  fallbackWindowId?: string;
  notes?: string;
}
export function importFallback(
  eventId: string,
  target: 'registrations' | 'footfall',
  body: FallbackImport,
): Promise<ImportResponse> {
  return eventApi<ImportResponse>(eventId, `/fallback/imports/${target}`, { method: 'POST', body });
}
