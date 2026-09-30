'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getReport } from './api';
export const reportKeys = {
  summary: (eventId: string) => [eventId, 'reports', 'summary'] as const,
};
export function useReport(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: reportKeys.summary(eventId),
    queryFn: () => getReport(eventId),
    enabled,
    staleTime: 60_000,
  });
}
