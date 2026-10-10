import type {
  MeResponse,
  MyPermissionsResponse,
  SessionSummary,
  SessionResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { api } from '@/shared/lib/api';
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

export async function listDevices(): Promise<SessionSummary[]> {
  return (await api<{ data: SessionSummary[] }>('/auth/sessions')).data;
}

export function revokeDevice(id: string): Promise<void> {
  return api(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function startMfaEnrollment(): Promise<{ secretCode: string }> {
  return api('/auth/mfa/setup', { method: 'POST', body: {} });
}

export function verifyMfaEnrollment(code: string): Promise<SessionResponse> {
  return api('/auth/mfa/verify', { method: 'POST', body: { code } });
}
