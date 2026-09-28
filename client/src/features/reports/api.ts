import type { FullReport } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { clientEnv } from '@/shared/lib/env';
import { getAccessToken } from '@/shared/lib/session';
export function getReport(): Promise<FullReport> {
  return api<FullReport>('/reports/summary');
}
export async function exportReport(format: 'xlsx' | 'csv'): Promise<Blob> {
  const response = await fetch(`${clientEnv.apiBaseUrl}/api/v1/reports/export?format=${format}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}
