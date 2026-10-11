'use client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { getCountViews, getDataHealth } from './api';
export function useCountViews(enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: [eventId, 'counts', 'views', session?.volunteerId],
    queryFn: ({ signal }) => getCountViews(eventId, signal),
    enabled: enabled && session !== null,
    gcTime: 0,
  });
}
export function useDataHealth(enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: [eventId, 'counts', 'health', session?.volunteerId],
    queryFn: ({ signal }) => getDataHealth(eventId, signal),
    enabled: enabled && session !== null,
    gcTime: 0,
  });
}
