'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';
import { useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import * as api from './api';

export const staffingKeys = { all: (eventId: string) => [eventId, 'staffing'] as const };
export function useStaffingRead<T>(
  key: string,
  read: (eventId: string, signal?: AbortSignal) => Promise<T>,
  enabled: boolean,
) {
  const eventId = useEventId();
  const session = useCurrentSession();
  const client = useQueryClient();
  const personId = session?.volunteerId ?? 'signed-out';
  const queryKey = useMemo(
    () => [...staffingKeys.all(eventId), personId, key],
    [eventId, personId, key],
  );
  const readable = enabled && !!session;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => read(eventId, signal),
    enabled: readable,
    gcTime: 0,
  });
  useEffect(() => {
    const purge = () => {
      void client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    };
    if (!readable) purge();
    return purge;
  }, [client, queryKey, readable]);
  useEffect(() => {
    if (query.error instanceof ApiError && [401, 403].includes(query.error.status)) {
      void client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    }
  }, [client, queryKey, query.error]);
  return query;
}
export function useStaffingWrite<T>(write: (eventId: string, body: T) => Promise<unknown>) {
  const eventId = useEventId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => write(eventId, body),
    onSuccess: () => client.invalidateQueries({ queryKey: [eventId] }),
    gcTime: 0,
  });
}
export function useAssignmentBoard(enabled: boolean) {
  return useStaffingRead(
    'board',
    async (eventId, signal) => {
      const [days, stations, people] = await Promise.all([
        api.listStaffingDays(eventId, signal),
        api.listStaffingStations(eventId, signal),
        api.listStaffingPeople(eventId, signal),
      ]);
      signal?.throwIfAborted();
      const rosters = await Promise.all(
        stations.map((station) => api.listStationAssignments(eventId, station.id, signal)),
      );
      return { days, stations, people, assignments: rosters.flat() };
    },
    enabled,
  );
}
