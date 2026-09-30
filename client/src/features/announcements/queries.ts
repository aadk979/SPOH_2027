'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateAnnouncementRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { listAnnouncements, acknowledgeAnnouncement, sendAnnouncement } from './api';
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
