import type { MeResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getMe(): Promise<MeResponse> {
  return api<MeResponse>('/me');
}

import { clientEnv } from '@/shared/lib/env';
export const hostedSignInUrl = `${clientEnv.apiBaseUrl}/api/v1/auth/login`;
