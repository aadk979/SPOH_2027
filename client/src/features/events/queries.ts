'use client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MyEvent } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { listMyEvents } from './api';

/** The one key outside an event: every other key starts with an event id (ADR-001 §5). */
export const eventListKey = ['events'] as const;

export function useMyEvents(): UseQueryResult<MyEvent[]> {
  const session = useCurrentSession();
  return useQuery({
    queryKey: eventListKey,
    queryFn: async () => (await listMyEvents()).data,
    enabled: session !== null,
    staleTime: 60_000,
  });
}
