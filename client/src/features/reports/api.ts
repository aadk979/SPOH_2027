import type { FullReport } from '@spoh/shared';
import { eventApi, eventApiPath } from '@/shared/lib/eventApi';
import { clientEnv } from '@/shared/lib/env';
import { getAccessToken } from '@/shared/lib/session';
export function getReport(
  eventId: string,
  includeRehearsal = false,
  current = false,
): Promise<FullReport> {
  return eventApi<FullReport>(
    eventId,
    `/reports/summary${includeRehearsal ? '?includeRehearsal=true' : current ? '?current=true' : ''}`,
  );
}
export async function exportReport(
  eventId: string,
  format: 'xlsx' | 'csv',
  options: { includeRehearsal?: boolean; current?: boolean } = {},
): Promise<Blob> {
  const path = eventApiPath(
    eventId,
    `/reports/export?format=${format}${options.includeRehearsal ? '&includeRehearsal=true' : options.current ? '&current=true' : ''}`,
  );
  const response = await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}
