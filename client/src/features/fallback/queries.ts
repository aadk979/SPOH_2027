'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeclareFallbackRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { listFallbackWindows, declareFallback, closeFallback } from './api';
export const fallbackKeys = {
  windows: (eventId: string) => [eventId, 'fallback', 'windows'] as const,
};
export function useFallbackWindows(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: fallbackKeys.windows(eventId),
    queryFn: () => listFallbackWindows(eventId),
    enabled,
    refetchInterval: 30_000,
  });
}
function useInvalidateWindows() {
  const client = useQueryClient();
  const eventId = useEventId();
  return () => {
    void client.invalidateQueries({ queryKey: fallbackKeys.windows(eventId) });
  };
}
export function useDeclareFallback(callbacks: {
  onSuccess: () => void;
  onError: (cause: Error) => void;
}) {
  const eventId = useEventId();
  const invalidate = useInvalidateWindows();
  return useMutation({
    mutationFn: (body: DeclareFallbackRequest) => declareFallback(eventId, body),
    onSuccess: () => {
      callbacks.onSuccess();
      invalidate();
    },
    onError: callbacks.onError,
  });
}
export function useCloseFallback() {
  const eventId = useEventId();
  const invalidate = useInvalidateWindows();
  return useMutation({
    mutationFn: (id: string) => closeFallback(eventId, id),
    onSuccess: invalidate,
  });
}
