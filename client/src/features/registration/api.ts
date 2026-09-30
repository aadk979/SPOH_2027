import type { CaptureCategoriesResponse, RegistrationSummaryResponse } from '@spoh/shared';
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

/** The event's categories: the booth's buttons (ADR-002). */
export async function listCategories(eventId: string): Promise<CaptureCategoriesResponse['data']> {
  return (await eventApi<CaptureCategoriesResponse>(eventId, '/registrations/categories')).data;
}
