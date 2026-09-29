'use client';
import { useQuery } from '@tanstack/react-query';
import { getRegistrationSummary } from './api';
export const registrationKeys = {
  summary: (stationId: string | undefined) => ['registrations', 'summary', stationId] as const,
};
/** Only for a role that may read the station dashboard; others would get a 403 each poll (F02-020). */
export function useRegistrationSummary(stationId: string | undefined, allowed: boolean) {
  return useQuery({
    queryKey: registrationKeys.summary(stationId),
    queryFn: () => getRegistrationSummary(stationId),
    enabled: allowed && Boolean(stationId),
    refetchInterval: 15_000,
    retry: false,
  });
}
