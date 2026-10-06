'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryActivityResponse, ScheduledActionStatus } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { ms } from '@/shared/lib/runtimeSettings';
import { ApiError } from '@/shared/lib/apiErrors';
import {
  listCategoryActivity,
  getCategoryActivity,
  listCategorySchedules,
  createCategorySchedule,
  updateCategorySchedule,
  cancelCategorySchedule,
} from './api';
import type { CategoryScheduleAttempt } from './model/categoryScheduleReview';

export const categoryKeys = {
  owner: (eventId: string, personId?: string) =>
    [eventId, 'private-category-schedules', personId ?? 'signed-out'] as const,
};
export function useCategoryActivityList(accessAvailable = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: [...categoryKeys.owner(eventId, session?.volunteerId), 'categories'],
    queryFn: ({ pageParam }) => listCategoryActivity(eventId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session && accessAvailable,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useCategoryActivity(categoryId: string, accessAvailable = true) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: [...categoryKeys.owner(eventId, session?.volunteerId), categoryId, 'current'],
    queryFn: () => getCategoryActivity(eventId, categoryId),
    enabled: !!session && accessAvailable,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useCategorySchedules(
  categoryId: string,
  status?: ScheduledActionStatus,
  accessAvailable = true,
) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: [
      ...categoryKeys.owner(eventId, session?.volunteerId),
      categoryId,
      'schedules',
      status ?? 'ALL',
    ],
    queryFn: ({ pageParam }) =>
      listCategorySchedules(eventId, { categoryId, status, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session && accessAvailable,
    gcTime: 0,
    refetchInterval: ms.dashboardPoll(),
    refetchIntervalInBackground: false,
  });
}
export function useClearCategorySchedules() {
  const client = useQueryClient();
  const eventId = useEventId();
  const personId = useCurrentSession()?.volunteerId;
  return useCallback(() => {
    const queryKey = categoryKeys.owner(eventId, personId);
    void client.cancelQueries({ queryKey });
    client.removeQueries({ queryKey });
  }, [client, eventId, personId]);
}
export function useApplyCategoryCurrent(categoryId: string) {
  const client = useQueryClient();
  const eventId = useEventId();
  const personId = useCurrentSession()?.volunteerId;
  const active = useActiveCategoryOwner();
  return useCallback(
    (current: CategoryActivityResponse) => {
      if (active.current)
        client.setQueryData(
          [...categoryKeys.owner(eventId, personId), categoryId, 'current'],
          current,
        );
    },
    [client, eventId, personId, categoryId, active],
  );
}
function useActiveCategoryOwner() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
export function useCategoryScheduleMutation(
  onApplied: (current: CategoryActivityResponse) => void,
) {
  const client = useQueryClient();
  const eventId = useEventId();
  const personId = useCurrentSession()?.volunteerId;
  const clear = useClearCategorySchedules();
  const active = useActiveCategoryOwner();
  return useMutation({
    mutationFn: (request: CategoryScheduleAttempt) =>
      request.kind === 'create'
        ? createCategorySchedule(eventId, request)
        : request.kind === 'edit'
          ? updateCategorySchedule(eventId, request)
          : cancelCategorySchedule(eventId, request),
    gcTime: 0,
    onSuccess: async (response) => {
      if (!active.current) return;
      onApplied(response.current);
      client.setQueryData(
        [...categoryKeys.owner(eventId, personId), response.current.data.id, 'current'],
        response.current,
      );
      await client.invalidateQueries({ queryKey: categoryKeys.owner(eventId, personId) });
    },
    onError: (error) => {
      if (error instanceof ApiError && [401, 403].includes(error.status)) clear();
    },
  });
}
