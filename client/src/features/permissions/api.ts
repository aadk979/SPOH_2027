import type {
  ChangeRolePermissionRequest,
  MemberPermissionsResponse,
  RolePermissionsResponse,
  SimulatePermissionRequest,
  SimulatePermissionResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function getRolePermissions(eventId: string): Promise<RolePermissionsResponse> {
  return eventApi<RolePermissionsResponse>(eventId, '/permissions');
}

export function changeRolePermission(
  eventId: string,
  body: ChangeRolePermissionRequest,
): Promise<RolePermissionsResponse> {
  return eventApi<RolePermissionsResponse>(eventId, '/permissions', { method: 'PUT', body });
}

export function simulatePermission(
  eventId: string,
  body: SimulatePermissionRequest,
): Promise<SimulatePermissionResponse> {
  return eventApi<SimulatePermissionResponse>(eventId, '/permissions/simulate', {
    method: 'POST',
    body,
  });
}

export function getMemberPermissions(
  eventId: string,
  personId: string,
): Promise<MemberPermissionsResponse> {
  return eventApi<MemberPermissionsResponse>(
    eventId,
    `/permissions/people/${encodeURIComponent(personId)}`,
  );
}
