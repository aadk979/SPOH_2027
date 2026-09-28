'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateAnnouncementRequest } from '@spoh/shared';
import { listAnnouncements, acknowledgeAnnouncement, sendAnnouncement } from './api';
export const announcementKeys = { all: ['announcements'] as const };
export function useAnnouncements(enabled: boolean) {
  return useQuery({
    queryKey: announcementKeys.all,
    queryFn: listAnnouncements,
    enabled,
    refetchInterval: 30_000,
  });
}
function useInvalidateAnnouncements() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: announcementKeys.all });
  };
}
export function useAcknowledgeAnnouncement() {
  const invalidate = useInvalidateAnnouncements();
  return useMutation({ mutationFn: acknowledgeAnnouncement, onSuccess: invalidate });
}
export function useSendAnnouncement(
  input: () => CreateAnnouncementRequest,
  callbacks: { onSuccess: () => void; onError: () => void },
) {
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: () => sendAnnouncement(input()),
    onSuccess: () => {
      callbacks.onSuccess();
      invalidate();
    },
    onError: callbacks.onError,
  });
}
