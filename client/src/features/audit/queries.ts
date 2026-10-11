'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';
import type { AuditQuery } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { getAuditLog } from './api';

export function useAuditLog(filters: AuditQuery, enabled: boolean) {
  const eventId = useEventId();
  const session = useCurrentSession();
  return useInfiniteQuery({
    queryKey: [eventId, 'audit', session?.volunteerId, filters],
    queryFn: ({ pageParam, signal }) =>
      getAuditLog(eventId, filters, { ...(pageParam ? { cursor: pageParam } : {}), signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: enabled && !!session,
    gcTime: 0,
  });
}

export function useAuditAccessFailure(error: Error | null, onAccessLost: () => void) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const personId = session?.volunteerId;
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      const queryKey = [eventId, 'audit', personId];
      void client.cancelQueries({ queryKey });
      client.removeQueries({ queryKey });
      onAccessLost();
    }
  }, [client, eventId, personId, error, onAccessLost]);
}
