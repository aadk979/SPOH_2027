import type { CreateIncidentRequest } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export const incidentEndpoints = { create: '/incidents' } as const;
export function createIncident(eventId: string, body: CreateIncidentRequest): Promise<unknown> {
  return eventApi(eventId, incidentEndpoints.create, { method: 'POST', body });
}
