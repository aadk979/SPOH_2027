'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getRegistrationSummary } from './api';
export const registrationKeys = {
  summary: (eventId: string, stationId: string | undefined) =>
    [eventId, 'registrations', 'summary', stationId] as const,
};
/** Only for a role that may read the station dashboard; others would get a 403 each poll (F02-020). */
export function useRegistrationSummary(stationId: string | undefined, allowed: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: registrationKeys.summary(eventId, stationId),
    queryFn: () => getRegistrationSummary(eventId, stationId),
    enabled: allowed && Boolean(stationId),
    refetchInterval: 15_000,
    retry: false,
  });
}
