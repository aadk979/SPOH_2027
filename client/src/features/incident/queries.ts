'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCurrentSession } from '@/features/session';
import { ApiError } from '@/shared/lib/apiErrors';
import type {
  CreateIncidentRequest,
  CreateIncidentFollowUpRequest,
  UpdateIncidentStatusRequest,
  IncidentStatus,
} from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { createIncident } from './api';
import { listIncidents, appendIncidentFollowUp, updateIncidentStatus } from './api';
export function useCreateIncident() {
  const eventId = useEventId();
  return useMutation({
    // Run the attempt offline too, so sendOrQueue can persist it instead of awaiting a paused mutation.
    networkMode: 'always',
    mutationFn: (body: CreateIncidentRequest) => createIncident(eventId, body),
  });
}

export function useIncidents(enabled: boolean, status?: IncidentStatus) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: [eventId, 'incidents', session?.volunteerId, status],
    queryFn: ({ pageParam, signal }) =>
      listIncidents(
        eventId,
        {
          limit: 50,
          ...(status ? { status } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    enabled: enabled && !!session,
    gcTime: 0,
  });
}

export function useIncidentAccessFailure(error: Error | null, onAccessLost: () => void) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const personId = session?.volunteerId;
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      const queryKey = [eventId, 'incidents', personId];
      void client.cancelQueries({ queryKey });
      client.removeQueries({ queryKey });
      onAccessLost();
    }
  }, [client, eventId, personId, error, onAccessLost]);
}

export function useIncidentFollowUp(id: string) {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIncidentFollowUpRequest) => appendIncidentFollowUp(eventId, id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: [eventId, 'incidents'] }),
  });
}

export function useIncidentStatus(id: string) {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateIncidentStatusRequest) => updateIncidentStatus(eventId, id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: [eventId, 'incidents'] }),
  });
}
