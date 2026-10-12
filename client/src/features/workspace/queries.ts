'use client';
import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RecordsFilter, type EntityRef, type RecordsRequest, type RecordsResponse, type SearchRequest } from '@spoh/shared';
import { useCurrentSession, useMyPermissions } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { getSessionGeneration } from '@/shared/lib/session';
import { correctRetainedRecord, readEntity, readRecords, searchWorkspace, type RetainedCorrection } from './api';

export const workspaceKeys = {
  owner: (eventId: string, personId: string | undefined) => [eventId, 'workspace', personId ?? 'signed-out'] as const,
};

/** Every authority change starts a fresh projection; previous owners leave no retained pages. */
export function useWorkspaceOwner() {
  const eventId = useEventId();
  const personId = useCurrentSession()?.volunteerId;
  const permissions = useMyPermissions();
  const client = useQueryClient();
  const owner = workspaceKeys.owner(eventId, personId);
  const previous = useRef(owner);
  const authority = permissions.isSuccess && !permissions.error;
  useEffect(() => {
    const old = previous.current;
    if (old[0] !== eventId || old[2] !== owner[2]) {
      void client.cancelQueries({ queryKey: old });
      client.removeQueries({ queryKey: old });
      previous.current = owner;
    }
    return () => { void client.cancelQueries({ queryKey: owner }); };
  }, [client, eventId, personId]);
  useEffect(() => {
    if (permissions.error) {
      void client.cancelQueries({ queryKey: owner });
      client.removeQueries({ queryKey: owner });
    }
  }, [client, eventId, personId, permissions.error]);
  return { eventId, personId, owner, enabled: !!personId && authority,
    permissions, standing: JSON.stringify(permissions.data?.actions ?? {}) };
}

export function useEntity(ref: EntityRef) {
  const context = useWorkspaceOwner();
  const query = useQuery({ queryKey: [...context.owner, 'entity', context.standing, ref],
    queryFn: ({ signal }) => readEntity(context.eventId, ref, signal),
    enabled: context.enabled, gcTime: 0, staleTime: 0, retry: false });
  return { ...query, data: context.enabled && !query.error ? query.data : undefined,
    error: context.permissions.error ?? query.error };
}

/** Timed pages retain the first observation; non-timed kinds reject an invented asOf. */
function nextPage(page: RecordsResponse): { cursor: string; filter: RecordsFilter } | undefined {
  if (!page.meta.nextCursor) return undefined;
  const timed = RecordsFilter.safeParse({ ...page.filter, asOf: page.asOf });
  return { cursor: page.meta.nextCursor, filter: timed.success ? timed.data : page.filter };
}

export function useRecords(request: RecordsRequest) {
  const context = useWorkspaceOwner();
  const query = useInfiniteQuery({ queryKey: [...context.owner, 'records', context.standing, request],
    initialPageParam: undefined as ReturnType<typeof nextPage>,
    queryFn: ({ pageParam, signal }) => readRecords(context.eventId,
      pageParam ? { ...request, ...pageParam } : request, signal),
    getNextPageParam: nextPage, enabled: context.enabled, gcTime: 0, staleTime: 0, retry: false });
  return { ...query, data: context.enabled && !query.error ? query.data : undefined,
    error: context.permissions.error ?? query.error };
}

export function useWorkspaceSearch(input: SearchRequest | null) {
  const context = useWorkspaceOwner();
  const query = useQuery({ queryKey: [...context.owner, 'search', context.standing, input],
    queryFn: ({ signal }) => searchWorkspace(context.eventId, input!, signal),
    enabled: context.enabled && !!input, gcTime: 0, staleTime: 0, retry: false });
  return { ...query, data: context.enabled && !query.error ? query.data : undefined,
    error: context.permissions.error ?? query.error };
}

export function useRetainedCorrection() {
  const { eventId, personId, enabled } = useWorkspaceOwner();
  const client = useQueryClient();
  return useMutation({ gcTime: 0, mutationFn: async (input: RetainedCorrection) => {
    if (!enabled) throw new Error('Reload your session and review this correction.');
    const generation = getSessionGeneration();
    const result = await correctRetainedRecord(eventId, input);
    if (generation !== getSessionGeneration()) throw new Error('Your session changed. Review this record again.');
    return result;
  }, onSuccess: () => client.invalidateQueries({ queryKey: [eventId] }),
  onError: () => client.invalidateQueries({ queryKey: workspaceKeys.owner(eventId, personId) }) });
}
