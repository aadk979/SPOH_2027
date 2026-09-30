'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLostFoundRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { createLostFound, listLostFound, claimLostFound, type LostFoundFilters } from './api';
export function useCreateLostFound() {
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: CreateLostFoundRequest) => createLostFound(eventId, body),
  });
}
export const lostFoundKeys = {
  all: (eventId: string) => [eventId, 'lost-found'] as const,
  list: (eventId: string, filters: LostFoundFilters) =>
    [eventId, 'lost-found', filters.query, filters.heldOnly] as const,
};
export function useLostFound(filters: LostFoundFilters, enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: lostFoundKeys.list(eventId, filters),
    queryFn: () => listLostFound(eventId, filters),
    enabled,
  });
}
export function useClaimLostFound() {
  const client = useQueryClient();
  const eventId = useEventId();
  return useMutation({
    mutationFn: (id: string) => claimLostFound(eventId, id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: lostFoundKeys.all(eventId) });
    },
  });
}
