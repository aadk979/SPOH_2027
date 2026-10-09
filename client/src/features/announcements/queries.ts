'use client';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { CreateAnnouncementRequest } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { pagedPoll } from '@/shared/lib/runtimeSettings';
import {
  listAnnouncements,
  acknowledgeAnnouncement,
  sendAnnouncement,
  listAnnouncementDrafts,
  listAnnouncementSchedules,
} from './api';
export const announcementKeys = { all: (eventId: string) => [eventId, 'announcements'] as const };
export function useAnnouncements(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: announcementKeys.all(eventId),
    queryFn: () => listAnnouncements(eventId),
    enabled,
    refetchInterval: 30_000,
  });
}
function useInvalidateAnnouncements() {
  const client = useQueryClient();
  const eventId = useEventId();
  return () => {
    void client.invalidateQueries({ queryKey: announcementKeys.all(eventId) });
  };
}
export function useAcknowledgeAnnouncement() {
  const eventId = useEventId();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: (id: string) => acknowledgeAnnouncement(eventId, id),
    onSuccess: invalidate,
  });
}
export function useSendAnnouncement(callbacks: { onSuccess: () => void; onError: () => void }) {
  const eventId = useEventId();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: (body: CreateAnnouncementRequest) => sendAnnouncement(eventId, body),
    onSuccess: () => {
      callbacks.onSuccess();
      invalidate();
    },
    onError: callbacks.onError,
  });
}

export const privateAnnouncementKeys = {
  drafts: (eventId: string, personId: string | undefined) =>
    [eventId, 'announcementDrafts', personId ?? 'signed-out'] as const,
  schedules: (eventId: string, personId: string | undefined, draftId: string) =>
    [eventId, 'announcementSchedules', personId ?? 'signed-out', draftId] as const,
};
export function useAnnouncementDrafts() {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: privateAnnouncementKeys.drafts(eventId, session?.volunteerId),
    queryFn: ({ pageParam }) => listAnnouncementDrafts(eventId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session,
    refetchInterval: pagedPoll(() => 5_000),
    gcTime: 0,
  });
}
export function useAnnouncementSchedules(draftId: string) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: privateAnnouncementKeys.schedules(eventId, session?.volunteerId, draftId),
    queryFn: ({ pageParam }) => listAnnouncementSchedules(eventId, draftId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!session && !!draftId,
    refetchInterval: pagedPoll(() => 5_000),
    gcTime: 0,
  });
}
function useInvalidatePrivateAnnouncements() {
  const client = useQueryClient();
  const eventId = useEventId();
  const session = useCurrentSession();
  return async (draftId?: string) => {
    await client.invalidateQueries({
      queryKey: privateAnnouncementKeys.drafts(eventId, session?.volunteerId),
    });
    if (draftId)
      await client.invalidateQueries({
        queryKey: privateAnnouncementKeys.schedules(eventId, session?.volunteerId, draftId),
      });
    await client.invalidateQueries({ queryKey: announcementKeys.all(eventId) });
  };
}

export function usePrivateAnnouncementMutation<Variables, Result>(input: {
  mutationFn: (variables: Variables) => Promise<Result>;
  draftIdOf: (result?: Result) => string | undefined;
  onSuccess: (result: Result) => void;
  onError: (error: unknown) => void;
}) {
  const invalidate = useInvalidatePrivateAnnouncements();
  return useMutation({
    gcTime: 0,
    mutationFn: input.mutationFn,
    onSuccess: async (result) => {
      await invalidate(input.draftIdOf(result));
      input.onSuccess(result);
    },
    onError: async (error) => {
      await invalidate(input.draftIdOf());
      input.onError(error);
    },
  });
}
