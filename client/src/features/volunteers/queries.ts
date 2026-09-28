'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  DeactivateVolunteerRequest,
  UpdateVolunteerRequest,
  VolunteerMutationResponse,
} from '@spoh/shared';
import {
  listVolunteers,
  updateVolunteer,
  deactivateVolunteer,
  reactivateVolunteer,
  type VolunteerFilters,
  type VolunteerListResponse,
} from './api';
import { useCurrentSession } from '@/features/session';

/**
 * Roster administration.
 *
 * Every mutation invalidates the list rather than patching it in place. The
 * server does more than the request says — a role change revokes sessions, a
 * deactivation drops push subscriptions — so an optimistic local edit would
 * show a row that disagrees with the truth in ways the admin cannot see.
 */

export const volunteerKeys = {
  all: ['admin', 'volunteers'] as const,
  list: (filters: VolunteerFilters) => ['admin', 'volunteers', filters] as const,
};
export function useVolunteers(filters: VolunteerFilters): UseQueryResult<VolunteerListResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: volunteerKeys.list(filters),
    queryFn: () => listVolunteers(filters),
    enabled: session !== null,
    // The roster is not live data. Refetching it every two seconds would be
    // noise on a screen somebody is reading rather than glancing at.
    staleTime: 30_000,
  });
}

function useInvalidate(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: volunteerKeys.all });
  };
}

export function useUpdateVolunteer(): UseMutationResult<
  VolunteerMutationResponse,
  Error,
  { id: string; patch: UpdateVolunteerRequest }
> {
  const invalidate = useInvalidate();

  return useMutation({
    mutationFn: updateVolunteer,
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
    mutationFn: deactivateVolunteer,
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
    mutationFn: reactivateVolunteer,
    onSuccess: invalidate,
  });
}
