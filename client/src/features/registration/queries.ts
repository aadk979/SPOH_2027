'use client';
import { useQuery } from '@tanstack/react-query';
import { getRegistrationSummary } from './api';
export const registrationKeys = {
  summary: (stationId: string | undefined) => ['registrations', 'summary', stationId] as const,
};
export function useRegistrationSummary(stationId: string | undefined) {
  return useQuery({
    queryKey: registrationKeys.summary(stationId),
    queryFn: () => getRegistrationSummary(stationId),
    enabled: Boolean(stationId),
    refetchInterval: 15_000,
    retry: false,
  });
}
