import type { MeResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export function getMe(eventId: string): Promise<MeResponse> {
  return eventApi<MeResponse>(eventId, '/me');
}

import { clientEnv } from '@/shared/lib/env';
export const hostedSignInUrl = `${clientEnv.apiBaseUrl}/api/v1/auth/login`;
