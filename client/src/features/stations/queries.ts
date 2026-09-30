'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { listStations } from './api';
export const stationKeys = { all: (eventId: string) => [eventId, 'stations'] as const };
export function useStations(enabled = true) {
  const eventId = useEventId();
  return useQuery({
    queryKey: stationKeys.all(eventId),
    queryFn: () => listStations(eventId),
    enabled,
    staleTime: 5 * 60_000,
  });
}
