'use client';
import { useQuery } from '@tanstack/react-query';
import { useEventId } from '@/shared/lib/eventContext';
import { getReport } from './api';
export const reportKeys = {
  summary: (eventId: string, includeRehearsal = false) =>
    [eventId, 'reports', 'summary', includeRehearsal] as const,
};
export function useReport(enabled: boolean, includeRehearsal = false) {
  const eventId = useEventId();
  return useQuery({
    queryKey: reportKeys.summary(eventId, includeRehearsal),
    queryFn: () => getReport(eventId, includeRehearsal),
    enabled,
    staleTime: 60_000,
  });
}
