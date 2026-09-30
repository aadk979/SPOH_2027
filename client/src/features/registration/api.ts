import type { RegistrationSummaryResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export const registrationEndpoints = {
  single: '/registrations',
  group: '/registrations/group',
} as const;
export function getRegistrationSummary(
  eventId: string,
  stationId: string | undefined,
): Promise<RegistrationSummaryResponse> {
  return eventApi<RegistrationSummaryResponse>(
    eventId,
    `/registrations/summary?groupBy=category&stationId=${stationId ?? ''}`,
  );
}
