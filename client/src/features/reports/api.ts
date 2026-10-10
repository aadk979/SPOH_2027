import type { FullReport } from '@spoh/shared';
import { ArchiveExportRecord, ArchiveExportResponse } from '@spoh/shared';
import { apiBlob } from '@/shared/lib/api';
import { eventApi, eventApiPath } from '@/shared/lib/eventApi';
import { loadClientConfiguration } from '@/shared/lib/env';
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
  const clientEnv = await loadClientConfiguration();
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

export async function createArchivePack(eventId: string, idempotencyKey: string) {
  const result = ArchiveExportResponse.parse(
    await eventApi(eventId, '/reports/archive-export', {
      method: 'POST',
      body: { idempotencyKey },
    }),
  );
  if (result.data.eventId !== eventId) throw new Error('The export belongs to another event');
  return result.data;
}
export async function listArchivePacks(eventId: string) {
  const result = await eventApi<{ data: unknown[] }>(eventId, '/reports/archive-exports');
  const records = result.data.map((record) => ArchiveExportRecord.parse(record));
  if (records.some((record) => record.eventId !== eventId))
    throw new Error('The exports belong to another event');
  return records;
}
export function downloadArchivePack(eventId: string, id: string) {
  return apiBlob(eventApiPath(eventId, `/reports/archive-export/${encodeURIComponent(id)}`));
}
