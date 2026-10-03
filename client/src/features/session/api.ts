import type { MeResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export function getMe(eventId: string): Promise<MeResponse> {
  return eventApi<MeResponse>(eventId, '/me');
}

import { getClientEnv } from '@/shared/lib/env';
export function getHostedSignInUrl(): string {
  return `${getClientEnv().apiBaseUrl}/api/v1/auth/login`;
}
