import type { FullReport } from '@spoh/shared';
import { eventApi, eventApiPath } from '@/shared/lib/eventApi';
import { clientEnv } from '@/shared/lib/env';
import { getAccessToken } from '@/shared/lib/session';
export function getReport(eventId: string, includeRehearsal = false): Promise<FullReport> {
  return eventApi<FullReport>(
    eventId,
    `/reports/summary${includeRehearsal ? '?includeRehearsal=true' : ''}`,
  );
}
export async function exportReport(
  eventId: string,
  format: 'xlsx' | 'csv',
  includeRehearsal = false,
): Promise<Blob> {
  const path = eventApiPath(
    eventId,
    `/reports/export?format=${format}${includeRehearsal ? '&includeRehearsal=true' : ''}`,
  );
  const response = await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}
