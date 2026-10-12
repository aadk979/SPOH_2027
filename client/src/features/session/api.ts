import type {
  MeResponse,
  MyPermissionsResponse,
  SessionSummary,
  SessionResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { api } from '@/shared/lib/api';
export function getMe(eventId: string, signal?: AbortSignal): Promise<MeResponse> {
  return eventApi<MeResponse>(eventId, '/me', { signal, cache: 'no-store' });
}

export function getMyPermissions(eventId: string, signal?: AbortSignal): Promise<MyPermissionsResponse> {
  return eventApi<MyPermissionsResponse>(eventId, '/me/permissions', { signal, cache: 'no-store' });
}

import { getClientEnv } from '@/shared/lib/env';
export function getHostedSignInUrl(): string {
  return `${getClientEnv().apiBaseUrl}/api/v1/auth/login`;
}

export async function listDevices(signal?: AbortSignal): Promise<SessionSummary[]> {
  return (await api<{ data: SessionSummary[] }>('/auth/sessions', { signal, cache: 'no-store' })).data;
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
