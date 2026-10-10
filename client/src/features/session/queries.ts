'use client';
import { useCallback } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Action, MeResponse, MyPermissionsResponse } from '@spoh/shared';
import { getMe, getMyPermissions } from './api';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from './useSession';
export const sessionKeys = {
  me: (eventId: string) => [eventId, 'me'] as const,
  permissions: (eventId: string) => [eventId, 'me', 'permissions'] as const,
};
/**
 * The boot call. One request returns identity, today's posting
 * and the escalation chain, so the home screen renders without a waterfall.
 */
export function useMe(): UseQueryResult<MeResponse> {
  const session = useCurrentSession();
  const eventId = useEventId();

  return useQuery({
    queryKey: sessionKeys.me(eventId),
    queryFn: () => getMe(eventId),
    enabled: session !== null,
    staleTime: 30_000,
  });
}

/**
 * What the caller may do in this event, answered by the server's policies (P11.8). Screens use
 * it to offer only what will be allowed; the server still decides every request.
 */
export function useMyPermissions(enabled = true): UseQueryResult<MyPermissionsResponse> {
  const session = useCurrentSession();
  const eventId = useEventId();

  return useQuery({
    queryKey: sessionKeys.permissions(eventId),
    queryFn: () => getMyPermissions(eventId),
    enabled: enabled && session !== null,
    staleTime: 30_000,
  });
}

/**
 * May the caller take this action here at all? Hiding what they cannot use saves a tap and
 * keeps screens honest; it is never the authorization, which the server decides on every
 * request from the same policies (ADR-005 §6). False until the answer arrives.
 */
export function useAllows(enabled = true): (action: Action) => boolean {
  const { data } = useMyPermissions(enabled);
  return useCallback((action: Action) => data?.actions?.[action] === true, [data]);
}
