'use client';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { MyEvent, TransitionEventRequest } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { getLifecycleReadiness, listMyEvents, transitionLifecycle } from './api';
import { ms } from '@/shared/lib/runtimeSettings';
import { useEventId } from '@/shared/lib/eventContext';

/** The one key outside an event: every other key starts with an event id (ADR-001 §5). */
export const eventListKey = ['events'] as const;
export const lifecycleKeys = {
  readiness: (eventId: string, personId: string | undefined) =>
    [eventId, 'lifecycle-readiness', personId ?? 'signed-out'] as const,
};

export function useLifecycleReadiness(enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: lifecycleKeys.readiness(eventId, session?.volunteerId),
    queryFn: () => getLifecycleReadiness(eventId),
    enabled: enabled && !!session,
    gcTime: 0,
  });
}

export function useTransitionLifecycle() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TransitionEventRequest) => transitionLifecycle(eventId, body),
    gcTime: 0,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [eventId] });
      await client.invalidateQueries({ queryKey: eventListKey });
    },
  });
}

export function useMyEvents(): UseQueryResult<MyEvent[]> {
  const session = useCurrentSession();
  return useQuery({
    queryKey: eventListKey,
    queryFn: async () => (await listMyEvents()).data,
    enabled: session !== null,
    staleTime: 60_000,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: true,
  });
}

/** Phase changes refresh postings and operational reads as well as the banner. */
export function useEventPhase(event: MyEvent | null): void {
  const client = useQueryClient();
  const previous = useRef<{ id: string; status: MyEvent['status'] } | null>(null);
  const id = event?.id;
  const status = event?.status;
  useEffect(() => {
    if (id && status) {
      if (previous.current?.id === id && previous.current.status !== status) {
        void client.invalidateQueries({ queryKey: [id] });
      }
      previous.current = { id, status };
    } else {
      previous.current = null;
    }
  }, [client, id, status]);
}
