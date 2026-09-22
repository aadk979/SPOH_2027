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
  CreateAssignmentRequest,
  DeactivateVolunteerRequest,
  EventDayRecord,
  ProvisionVolunteerRequest,
  ProvisionVolunteerResponse,
  ResendInviteResponse,
  RosterImportRequest,
  RosterImportResponse,
  ShiftAssignmentRecord,
  StationSummary,
  UpdateVolunteerRequest,
  VolunteerAdminRecord,
  VolunteerDetailResponse,
  VolunteerMutationResponse,
} from '@spoh/shared';
import { api, apiBlob } from '@/lib/api';
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

/**
 * One person with their shifts, fetched when their row is opened. The list
 * carries only a count so 200 rows do not each drag their assignments along.
 */
export function useVolunteerDetail(id: string | null): UseQueryResult<VolunteerDetailResponse> {
  return useQuery({
    queryKey: ['admin', 'volunteers', 'detail', id],
    queryFn: () => api<VolunteerDetailResponse>(`/admin/volunteers/${id as string}`),
    enabled: id !== null,
    staleTime: 30_000,
  });
}

/**
 * Everyone who could be somebody's manager: active, and not a plain
 * volunteer. Two hundred names in a select is fine; two hundred volunteers
 * who report to nobody in it is not.
 */
export function useManagers(): UseQueryResult<VolunteerAdminRecord[]> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['admin', 'volunteers', 'managers'],
    queryFn: async () => {
      const response = await api<VolunteerListResponse>(
        '/admin/volunteers?active=true&sort=role&limit=200',
      );
      return response.data.filter((volunteer) => volunteer.role !== 'VOLUNTEER');
    },
    enabled: session !== null,
    staleTime: 60_000,
  });
}

export function useStations(): UseQueryResult<StationSummary[]> {
  const session = useCurrentSession();
  return useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await api<{ data: StationSummary[] }>('/stations')).data,
    enabled: session !== null,
    staleTime: 60_000,
  });
}

export function useEventDays(): UseQueryResult<EventDayRecord[]> {
  const session = useCurrentSession();
  return useQuery({
    queryKey: ['admin', 'event-days'],
    queryFn: async () => (await api<{ data: EventDayRecord[] }>('/admin/event-days')).data,
    enabled: session !== null,
    staleTime: 60_000,
  });
}

function useInvalidate(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'volunteers'] });
  };
}

export function useProvisionVolunteer(): UseMutationResult<
  ProvisionVolunteerResponse,
  Error,
  ProvisionVolunteerRequest
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body) =>
      api<ProvisionVolunteerResponse>('/roster/volunteers', { method: 'POST', body }),
    onSuccess: invalidate,
  });
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

export function useResendInvite(): UseMutationResult<ResendInviteResponse, Error, string> {
  return useMutation({
    mutationFn: (id) =>
      api<ResendInviteResponse>(`/admin/volunteers/${id}/resend-invite`, { method: 'POST' }),
  });
}

export function useCreateAssignment(): UseMutationResult<
  { assignment: ShiftAssignmentRecord },
  Error,
  CreateAssignmentRequest
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body) =>
      api<{ assignment: ShiftAssignmentRecord }>('/admin/assignments', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteAssignment(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (id) => api<void>(`/admin/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useImportRoster(): UseMutationResult<
  RosterImportResponse,
  Error,
  RosterImportRequest
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: (body) => api<RosterImportResponse>('/roster/import', { method: 'POST', body }),
    onSuccess: (result) => {
      if (result.committed) invalidate();
    },
  });
}

/**
 * Save the roster as a CSV in the import's own format.
 *
 * The round trip — export, fix it up in a spreadsheet, import — is how a Chief
 * re-plans a day without retyping 200 names, so the file is the template.
 */
export function useExportRoster(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: async () => {
      const blob = await apiBlob('/admin/volunteers/export.csv');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'spoh-roster.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    },
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
