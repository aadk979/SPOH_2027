import type {
  CommitteeRole,
  DeactivateVolunteerRequest,
  UpdateVolunteerRequest,
  VolunteerAdminRecord,
  VolunteerMutationResponse,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
export interface VolunteerFilters {
  q: string;
  role: CommitteeRole | '';
  active: 'true' | 'false' | '';
  sort: 'name' | 'role' | 'lastSeen' | 'created';
}

export interface VolunteerListResponse {
  data: VolunteerAdminRecord[];
  meta: { count: number; nextCursor: string | null };
}

function toQueryString(filters: VolunteerFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.active) params.set('active', filters.active);
  params.set('sort', filters.sort);
  params.set('limit', '100');
  return params.toString();
}

export function listVolunteers(filters: VolunteerFilters): Promise<VolunteerListResponse> {
  return api<VolunteerListResponse>(`/admin/volunteers?${toQueryString(filters)}`);
}

export function updateVolunteer(input: {
  id: string;
  patch: UpdateVolunteerRequest;
}): Promise<VolunteerMutationResponse> {
  return api<VolunteerMutationResponse>(`/admin/volunteers/${input.id}`, {
    method: 'PATCH',
    body: input.patch,
  });
}

export function deactivateVolunteer(input: {
  id: string;
  body: DeactivateVolunteerRequest;
}): Promise<VolunteerMutationResponse> {
  return api<VolunteerMutationResponse>(`/admin/volunteers/${input.id}/deactivate`, {
    method: 'POST',
    body: input.body,
  });
}

export function reactivateVolunteer(id: string): Promise<VolunteerMutationResponse> {
  return api<VolunteerMutationResponse>(`/admin/volunteers/${id}/reactivate`, { method: 'POST' });
}
