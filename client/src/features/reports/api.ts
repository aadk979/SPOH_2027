import type { FullReport } from '@spoh/shared';
import { eventApi, eventApiPath } from '@/shared/lib/eventApi';
import { clientEnv } from '@/shared/lib/env';
import { getAccessToken } from '@/shared/lib/session';
export function getReport(eventId: string): Promise<FullReport> {
  return eventApi<FullReport>(eventId, '/reports/summary');
}
export async function exportReport(eventId: string, format: 'xlsx' | 'csv'): Promise<Blob> {
  const path = eventApiPath(eventId, `/reports/export?format=${format}`);
  const response = await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}
