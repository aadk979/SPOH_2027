import type { CreateIncidentRequest } from '@spoh/shared';
import { api } from '@/shared/lib/api';

export const incidentEndpoints = { create: '/incidents' } as const;
export function createIncident(body: CreateIncidentRequest): Promise<unknown> {
  return api(incidentEndpoints.create, { method: 'POST', body });
}
