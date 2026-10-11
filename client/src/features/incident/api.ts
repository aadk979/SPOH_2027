import {
  type CreateIncidentRequest,
  type ListIncidentsQuery,
  type CreateIncidentFollowUpRequest,
  type UpdateIncidentStatusRequest,
  IncidentRecord,
  CreateIncidentFollowUpRequest as FollowUpSchema,
  UpdateIncidentStatusRequest as StatusSchema,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export const incidentEndpoints = { create: '/incidents' } as const;
export function createIncident(eventId: string, body: CreateIncidentRequest): Promise<unknown> {
  return eventApi(eventId, incidentEndpoints.create, { method: 'POST', body });
}

export async function listIncidents(
  eventId: string,
  query: ListIncidentsQuery,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const page = await eventApi<{
    data: unknown[];
    meta: { count: number; nextCursor: string | null };
  }>(eventId, `/incidents?${params}`, { signal, cache: 'no-store' });
  return { ...page, data: page.data.map((item) => IncidentRecord.parse(item)) };
}

export async function appendIncidentFollowUp(
  eventId: string,
  id: string,
  body: CreateIncidentFollowUpRequest,
): Promise<IncidentRecord> {
  const response = await eventApi<{ incident: unknown }>(
    eventId,
    `/incidents/${encodeURIComponent(id)}/follow-ups`,
    { method: 'POST', body: FollowUpSchema.parse(body) },
  );
  return IncidentRecord.parse(response.incident);
}

export async function updateIncidentStatus(
  eventId: string,
  id: string,
  body: UpdateIncidentStatusRequest,
): Promise<IncidentRecord> {
  const response = await eventApi<{ incident: unknown }>(
    eventId,
    `/incidents/${encodeURIComponent(id)}/status`,
    { method: 'POST', body: StatusSchema.parse(body) },
  );
  return IncidentRecord.parse(response.incident);
}
