import type { RegistrationSummaryResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export const registrationEndpoints = {
  single: '/registrations',
  group: '/registrations/group',
} as const;
export function getRegistrationSummary(
  stationId: string | undefined,
): Promise<RegistrationSummaryResponse> {
  return api<RegistrationSummaryResponse>(
    `/registrations/summary?groupBy=category&stationId=${stationId ?? ''}`,
  );
}
