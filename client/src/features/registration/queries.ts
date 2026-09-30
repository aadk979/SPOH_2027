'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getRegistrationSummary, listCategories } from './api';
import { cacheCategories, readCachedCategories } from './model/categoryCache';
export const registrationKeys = {
  categories: (eventId: string) => [eventId, 'registrations', 'categories'] as const,
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

/** The booth's buttons, from the event; the last list seen here while offline. */
export function useCaptureCategories() {
  const eventId = useEventId();
  return useQuery({
    queryKey: registrationKeys.categories(eventId),
    queryFn: async () => {
      const categories = await listCategories(eventId);
      cacheCategories(eventId, categories);
      return categories;
    },
    initialData: () => readCachedCategories(eventId),
    initialDataUpdatedAt: 0,
    staleTime: 5 * 60_000,
  });
}
