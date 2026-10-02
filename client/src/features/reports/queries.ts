'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getReport } from './api';
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
