import { AuditLogResponse, AuditQuery } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export async function getAuditLog(
  eventId: string,
  filters: AuditQuery,
  options: { cursor?: string; signal?: AbortSignal } = {},
): Promise<AuditLogResponse> {
  const { cursor, signal } = options;
  const input = AuditQuery.parse({ ...filters, ...(cursor ? { cursor } : {}) });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) query.set(key, String(value));
  return AuditLogResponse.parse(
    await eventApi(eventId, `/audit?${query}`, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),
  );
}
