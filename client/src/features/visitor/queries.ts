'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { CreateVisitorFieldRequest, UpdateVisitorFieldRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from '@/features/session';
import { createVisitorField, listVisitorFields, updateVisitorField } from './api';
import { readVisitorRecords } from './api';
export function useVisitorRecords(enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const client = useQueryClient();
  const personId = session?.volunteerId;
  const role = session?.role;
  useEffect(() => {
    const queryKey = [eventId, 'visitor-records', personId, role];
    return () => {
      // Private values leave with their reader; consuming the query signal also fences late replies.
      client.removeQueries({ queryKey, exact: true });
    };
  }, [client, eventId, personId, role]);
  return useQuery({
    queryKey: [eventId, 'visitor-records', personId, role],
    queryFn: async ({ signal }) => {
      const response = await readVisitorRecords(eventId);
      signal.throwIfAborted();
      return response;
    },
    enabled: enabled && session !== null,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
}

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
