'use client';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { MyEvent } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { listMyEvents } from './api';
import { ms } from '@/shared/lib/runtimeSettings';

/** The one key outside an event: every other key starts with an event id (ADR-001 §5). */
export const eventListKey = ['events'] as const;

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
