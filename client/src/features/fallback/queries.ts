'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeclareFallbackRequest } from '@spoh/shared';
import { listFallbackWindows, declareFallback, closeFallback } from './api';
export const fallbackKeys = { windows: ['fallback', 'windows'] as const };
export function useFallbackWindows(enabled: boolean) {
  return useQuery({
    queryKey: fallbackKeys.windows,
    queryFn: listFallbackWindows,
    enabled,
    refetchInterval: 30_000,
  });
}
function useInvalidateWindows() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: fallbackKeys.windows });
  };
}
export function useDeclareFallback(
  input: DeclareFallbackRequest,
  callbacks: { onSuccess: () => void; onError: (cause: Error) => void },
) {
  const invalidate = useInvalidateWindows();
  return useMutation({
    mutationFn: () => declareFallback(input),
    onSuccess: () => {
      callbacks.onSuccess();
      invalidate();
    },
    onError: callbacks.onError,
  });
}
export function useCloseFallback() {
  const invalidate = useInvalidateWindows();
  return useMutation({ mutationFn: closeFallback, onSuccess: invalidate });
}
