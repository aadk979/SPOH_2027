'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SaveContentDraftRequest,
  ReviewContentRequest,
  ScheduleContentRequest,
} from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import {
  getContentDraft,
  getPublishedContent,
  listContentVersions,
  publishContent,
  reviewContent,
  saveContentDraft,
  scheduleContent,
  uploadContentImage,
  getContentImage,
} from './api';

export const contentKeys = {
  draft: (eventId: string) => [eventId, 'content', 'draft'] as const,
  published: (eventId: string, personId?: string) =>
    [eventId, 'content', 'published', personId] as const,
  versions: (eventId: string) => [eventId, 'content', 'versions'] as const,
};
export function usePublishedContent() {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useQuery({
    queryKey: contentKeys.published(eventId, session?.volunteerId),
    queryFn: () => getPublishedContent(eventId, session!.volunteerId),
    enabled: !!session,
    staleTime: 60_000,
    retry: false,
    networkMode: 'always',
  });
}
export function useContentImage(path?: string) {
  const eventId = useEventId();
  return useQuery({
    queryKey: [eventId, 'content', 'image', path],
    queryFn: () => getContentImage(path!),
    enabled: !!path,
    staleTime: Infinity,
    retry: false,
    networkMode: 'always',
  });
}
export function useContentDraft(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: contentKeys.draft(eventId),
    queryFn: () => getContentDraft(eventId),
    enabled,
    gcTime: 0,
  });
}
export function useContentVersions(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: contentKeys.versions(eventId),
    queryFn: () => listContentVersions(eventId),
    enabled,
  });
}
function useReceipt() {
  const eventId = useEventId();
  const client = useQueryClient();
  const receipt = useRetryKey();
  return {
    eventId,
    receipt,
    onSuccess: async () => {
      receipt.clear();
      await client.invalidateQueries({ queryKey: [eventId] });
    },
  };
}
export function useSaveContent() {
  const context = useReceipt();
  return useMutation({
    mutationFn: (input: Omit<SaveContentDraftRequest, 'idempotencyKey'>) =>
      saveContentDraft(context.eventId, {
        ...input,
        idempotencyKey: context.receipt.forInput(input),
      }),
    onSuccess: context.onSuccess,
  });
}
export function useReviewContent() {
  const context = useReceipt();
  return useMutation({
    mutationFn: (input: Omit<ReviewContentRequest, 'idempotencyKey'>) =>
      reviewContent(context.eventId, { ...input, idempotencyKey: context.receipt.forInput(input) }),
    onSuccess: context.onSuccess,
  });
}
export function usePublishContent() {
  const context = useReceipt();
  return useMutation({
    mutationFn: (input: Omit<ReviewContentRequest, 'idempotencyKey'>) =>
      publishContent(context.eventId, {
        ...input,
        idempotencyKey: context.receipt.forInput(input),
      }),
    onSuccess: context.onSuccess,
  });
}
export function useScheduleContent() {
  const context = useReceipt();
  return useMutation({
    mutationFn: (input: Omit<ScheduleContentRequest, 'idempotencyKey'>) =>
      scheduleContent(context.eventId, {
        ...input,
        idempotencyKey: context.receipt.forInput(input),
      }),
    onSuccess: context.onSuccess,
  });
}
export function useUploadContentImage() {
  const eventId = useEventId();
  const receipt = useRetryKey();
  return useMutation({
    mutationFn: (file: File) =>
      uploadContentImage(eventId, {
        file,
        body: {
          idempotencyKey: receipt.forInput({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          }),
          contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          contentLength: file.size,
        },
      }),
    onSuccess: () => receipt.clear(),
  });
}
