'use client';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  ChangeRolePermissionRequest,
  MemberPermissionsResponse,
  RolePermissionsResponse,
  SimulatePermissionRequest,
} from '@spoh/shared';
import { useCurrentSession, sessionKeys } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import {
  changeRolePermission,
  getMemberPermissions,
  getRolePermissions,
  simulatePermission,
} from './api';

export const permissionKeys = {
  roles: (eventId: string) => [eventId, 'permissions', 'roles'] as const,
  member: (eventId: string, personId: string) =>
    [eventId, 'permissions', 'member', personId] as const,
};

export function useRolePermissions(enabled = true): UseQueryResult<RolePermissionsResponse> {
  const session = useCurrentSession();
  const eventId = useEventId();
  return useQuery({
    queryKey: permissionKeys.roles(eventId),
    queryFn: () => getRolePermissions(eventId),
    enabled: enabled && session !== null,
  });
}

/**
 * A grant change answers with the whole table; every member's own permissions may have
 * changed with it, so the caller's are read again too.
 */
export function useChangeRolePermission() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: ChangeRolePermissionRequest) => changeRolePermission(eventId, body),
    onSuccess: async (response) => {
      client.setQueryData(permissionKeys.roles(eventId), response);
      await client.invalidateQueries({ queryKey: [eventId, 'permissions', 'member'] });
      await client.invalidateQueries({ queryKey: sessionKeys.permissions(eventId) });
    },
  });
}

export function useSimulatePermission() {
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: SimulatePermissionRequest) => simulatePermission(eventId, body),
  });
}

export function useMemberPermissions(
  personId: string | null,
): UseQueryResult<MemberPermissionsResponse> {
  const eventId = useEventId();
  return useQuery({
    queryKey: permissionKeys.member(eventId, personId ?? ''),
    queryFn: () => getMemberPermissions(eventId, personId ?? ''),
    enabled: personId !== null,
  });
}
