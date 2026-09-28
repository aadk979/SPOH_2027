import type { CreateIncidentRequest } from '@spoh/shared';
import { api } from '@/shared/lib/api';

export function createIncident(body: CreateIncidentRequest): Promise<unknown> {
  return api('/incidents', { method: 'POST', body });
}
