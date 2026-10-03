'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ScheduledActionStatus } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { ms } from '@/shared/lib/runtimeSettings';
import { listScheduleTimeline } from './api';

export const scheduleTimelineKeys = {
  list: (eventId: string, personId: string | undefined, status?: ScheduledActionStatus) =>
    [eventId, 'schedule-timeline', personId ?? 'signed-out', status ?? 'ALL'] as const,
};

export function useScheduleTimeline(enabled: boolean, status?: ScheduledActionStatus) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: scheduleTimelineKeys.list(eventId, session?.volunteerId, status),
    queryFn: ({ pageParam }) => listScheduleTimeline(eventId, { status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: enabled && !!session,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
