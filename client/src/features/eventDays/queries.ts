'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from '@/features/session';
import { listEventDays } from './api';

export const eventDayKeys = {
  all: (eventId: string, personId: string) => [eventId, 'event-days', personId] as const,
};

/** The event's days, earliest first; a day is structure, not a secret (`Structure.Read`). */
export function useEventDays(enabled = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: eventDayKeys.all(eventId, session?.volunteerId ?? 'signed-out'),
    queryFn: ({ signal }) => listEventDays(eventId, signal),
    enabled: enabled && !!session,
    staleTime: 60_000,
    gcTime: 0,
  });
}
