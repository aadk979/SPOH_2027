'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVisitorFieldRequest, UpdateVisitorFieldRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { createVisitorField, listVisitorFields, updateVisitorField } from './api';

export const visitorKeys = {
  fields: (eventId: string) => [eventId, 'visitor-fields'] as const,
};

export function useVisitorFields(enabled: boolean) {
  const eventId = useEventId();
  return useQuery({
    queryKey: visitorKeys.fields(eventId),
    queryFn: () => listVisitorFields(eventId),
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateVisitorField() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVisitorFieldRequest) => createVisitorField(eventId, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: visitorKeys.fields(eventId) }),
  });
}

export function useUpdateVisitorField() {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: { id: string; body: UpdateVisitorFieldRequest }) =>
      updateVisitorField(eventId, change.id, change.body),
    onSuccess: () => void client.invalidateQueries({ queryKey: visitorKeys.fields(eventId) }),
  });
}
