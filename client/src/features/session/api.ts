import type { MeResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getMe(): Promise<MeResponse> {
  return api<MeResponse>('/me');
}
