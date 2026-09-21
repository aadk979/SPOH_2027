'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CommitteeRole,
  DeactivateVolunteerRequest,
  UpdateVolunteerRequest,
  VolunteerAdminRecord,
  VolunteerMutationResponse,
} from '@spoh/shared';
import { api } from '@/lib/api';
import { useCurrentSession } from '../session/useSession';

/**
 * Roster administration.
 *
 * Every mutation invalidates the list rather than patching it in place. The
 * server does more than the request says — a role change revokes sessions, a
 * deactivation drops push subscriptions — so an optimistic local edit would
 * show a row that disagrees with the truth in ways the admin cannot see.
 */

export interface VolunteerFilters {
  q: string;
  role: CommitteeRole | '';
  active: 'true' | 'false' | '';
  sort: 'name' | 'role' | 'lastSeen' | 'created';
}

interface VolunteerListResponse {
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

export function useVolunteers(filters: VolunteerFilters): UseQueryResult<VolunteerListResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['admin', 'volunteers', filters],
    queryFn: () => api<VolunteerListResponse>(`/admin/volunteers?${toQueryString(filters)}`),
    enabled: session !== null,
    // The roster is not live data. Refetching it every two seconds would be
    // noise on a screen somebody is reading rather than glancing at.
    staleTime: 30_000,
  });
}

function useInvalidate(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'volunteers'] });
  };
}

export function useUpdateVolunteer(): UseMutationResult<
  VolunteerMutationResponse,
  Error,
  { id: string; patch: UpdateVolunteerRequest }
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, patch }) =>
      api<VolunteerMutationResponse>(`/admin/volunteers/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: invalidate,
  });
}

export function useDeactivateVolunteer(): UseMutationResult<
  VolunteerMutationResponse,
  Error,
  { id: string; body: DeactivateVolunteerRequest }
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: ({ id, body }) =>
      api<VolunteerMutationResponse>(`/admin/volunteers/${id}/deactivate`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useReactivateVolunteer(): UseMutationResult<
  VolunteerMutationResponse,
  Error,
  string
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id) =>
      api<VolunteerMutationResponse>(`/admin/volunteers/${id}/reactivate`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

/** Committee roles in precedence order, for a select that reads sensibly. */
export const ROLE_LABELS: ReadonlyArray<{ value: CommitteeRole; label: string }> = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'CHIEF_COORDINATOR', label: 'Chief Coordinator' },
  { value: 'DEPUTY_COORDINATOR', label: 'Deputy Coordinator' },
  { value: 'IC', label: 'IC' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
];

export function roleLabel(role: CommitteeRole): string {
  return ROLE_LABELS.find((entry) => entry.value === role)?.label ?? role;
}
