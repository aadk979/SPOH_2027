'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getReport, createArchivePack, listArchivePacks } from './api';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
export const reportKeys = {
  summary: (eventId: string, includeRehearsal = false, current = false) =>
    [eventId, 'reports', 'summary', includeRehearsal, current] as const,
};
export function useReport(enabled: boolean, includeRehearsal = false, current = false) {
  const eventId = useEventId();
  return useQuery({
    queryKey: reportKeys.summary(eventId, includeRehearsal, current),
    queryFn: () => getReport(eventId, includeRehearsal, current),
    enabled,
    staleTime: 60_000,
  });
}
export function useArchivePacks(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: [eventId, 'reports', 'archive-exports'],
    queryFn: () => listArchivePacks(eventId),
    enabled,
    gcTime: 0,
  });
}
export function useCreateArchivePack() {
  const eventId = useEventId();
  const client = useQueryClient();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: () => createArchivePack(eventId, receipt.forInput({ eventId })),
    onSuccess: async () => {
      receipt.clear();
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  });
}
