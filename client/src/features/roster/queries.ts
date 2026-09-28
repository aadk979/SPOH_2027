'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { listPendingSwaps, decideSwap } from './api';
export const rosterKeys = { pending: ['roster', 'swaps', 'pending'] as const };
export function usePendingSwaps(enabled: boolean) {
  return useQuery({
    queryKey: rosterKeys.pending,
    queryFn: listPendingSwaps,
    enabled,
    refetchInterval: 30_000,
  });
}
export function useDecideSwap() {
  return useMutation({ mutationFn: decideSwap });
}
