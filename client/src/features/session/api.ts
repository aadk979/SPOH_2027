import type { MeResponse, MyPermissionsResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export function getMe(eventId: string): Promise<MeResponse> {
  return eventApi<MeResponse>(eventId, '/me');
}

export function getMyPermissions(eventId: string): Promise<MyPermissionsResponse> {
  return eventApi<MyPermissionsResponse>(eventId, '/me/permissions');
}

import { getClientEnv } from '@/shared/lib/env';
export function getHostedSignInUrl(): string {
  return `${getClientEnv().apiBaseUrl}/api/v1/auth/login`;
}
