'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateFootfallBulkRequest } from '@spoh/shared';
import { useEvent, useEventId } from '@/shared/lib/eventContext';
import { recordBulkFootfall, voidRecord, type VoidRecordInput } from './api';
import { recentCorrectionRecords } from './api';

export function useVoidRecord() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: VoidRecordInput) => voidRecord(eventId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: [eventId] }),
  });
}

export function useBulkFootfall() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFootfallBulkRequest) => recordBulkFootfall(eventId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: [eventId] }),
  });
}

export function useRecentCorrectionRecords(kind: 'registration' | 'footfall', stationId: string) {
  const event = useEvent();
  return useInfiniteQuery({
    queryKey: [event.id, 'corrections', kind, stationId, event.status],
    queryFn: ({ pageParam }) =>
      recentCorrectionRecords(event.id, {
        kind,
        stationId,
        rehearsal: event.status === 'REHEARSAL',
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!stationId,
    gcTime: 0,
  });
}
