'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduledActionStatus,
  ScopedSettingsTarget,
  ScopedSettingsReadResponse,
  ScopedOperationalSettingKey,
} from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { ms, pagedPoll } from '@/shared/lib/runtimeSettings';
import {
  listScheduleTimeline,
  listCaptureSchedules,
  createCaptureSchedule,
  updateCaptureSchedule,
  cancelCaptureSchedule,
} from './api';
import { ApiError } from '@/shared/lib/apiErrors';
import type { CaptureScheduleAttempt } from './model/captureScheduleReview';

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
    refetchInterval: pagedPoll(ms.dashboardPoll),
    refetchIntervalInBackground: false,
  });
}

export const captureScheduleKeys = {
  owner: (eventId: string, personId: string | undefined) =>
    [eventId, 'capture-schedules', personId ?? 'signed-out'] as const,
  list: (
    eventId: string,
    personId: string | undefined,
    input: {
      target: ScopedSettingsTarget;
      status?: ScheduledActionStatus;
      key?: ScopedOperationalSettingKey;
    },
  ) =>
    [
      ...captureScheduleKeys.owner(eventId, personId),
      input.target.scope,
      input.target.scope === 'station' ? input.target.stationId : 'event',
      input.key ?? 'capture.open',
      input.status ?? 'ALL',
    ] as const,
};
export function useCaptureSchedules(
  target: ScopedSettingsTarget,
  status?: ScheduledActionStatus,
  key: ScopedOperationalSettingKey = 'capture.open',
) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: captureScheduleKeys.list(eventId, session?.volunteerId, { target, status, key }),
    queryFn: ({ pageParam }) =>
      listCaptureSchedules(eventId, { target, status, key, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session,
    gcTime: 0,
    refetchInterval: pagedPoll(ms.dashboardPoll),
    refetchIntervalInBackground: false,
  });
}
export function useClearCaptureSchedules() {
  const client = useQueryClient();
  const eventId = useEventId();
  const session = useCurrentSession();
  return () =>
    client.removeQueries({ queryKey: captureScheduleKeys.owner(eventId, session?.volunteerId) });
}
export function useCaptureScheduleMutation(
  onApplied: (current: ScopedSettingsReadResponse) => void,
) {
  const client = useQueryClient();
  const eventId = useEventId();
  const session = useCurrentSession();
  return useMutation({
    mutationFn: (request: CaptureScheduleAttempt) =>
      request.kind === 'create'
        ? createCaptureSchedule(eventId, request.body)
        : request.kind === 'edit'
          ? updateCaptureSchedule(eventId, request)
          : cancelCaptureSchedule(eventId, request),
    gcTime: 0,
    onSuccess: async (response) => {
      onApplied(response.current);
      await client.invalidateQueries({
        queryKey: captureScheduleKeys.owner(eventId, session?.volunteerId),
      });
    },
    onError: (failure) => {
      if (failure instanceof ApiError && [401, 403].includes(failure.status))
        client.removeQueries({
          queryKey: captureScheduleKeys.owner(eventId, session?.volunteerId),
        });
    },
  });
}
