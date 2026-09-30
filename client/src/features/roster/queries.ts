'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { listPendingSwaps, decideSwap } from './api';
export const rosterKeys = {
  pending: (eventId: string) => [eventId, 'roster', 'swaps', 'pending'] as const,
};
export function usePendingSwaps(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: rosterKeys.pending(eventId),
    queryFn: () => listPendingSwaps(eventId),
    enabled,
    refetchInterval: 30_000,
  });
}
export function useDecideSwap() {
  const eventId = useEventId();
  return useMutation({
    mutationFn: (input: { id: string; decision: 'APPROVED' | 'REJECTED' }) =>
      decideSwap(eventId, input),
  });
}
