import type { FallbackWindowRecord, DeclareFallbackRequest, ImportResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export async function listFallbackWindows(): Promise<FallbackWindowRecord[]> {
  return (await api<{ data: FallbackWindowRecord[] }>('/fallback/windows')).data;
}
export function declareFallback(body: DeclareFallbackRequest): Promise<unknown> {
  return api('/fallback/windows', { method: 'POST', body });
}
export function closeFallback(id: string): Promise<unknown> {
  return api(`/fallback/windows/${id}/close`, { method: 'POST', body: {} });
}
export interface FallbackImport {
  source: 'FALLBACK_SHEET' | 'PAPER';
  rows: Array<Record<string, unknown>>;
  commit: boolean;
  fileName?: string;
  notes?: string;
}
export function importFallback(
  target: 'registrations' | 'footfall',
  body: FallbackImport,
): Promise<ImportResponse> {
  return api<ImportResponse>(`/fallback/imports/${target}`, { method: 'POST', body });
}
