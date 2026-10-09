'use client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeResponse, MyPermissionsResponse } from '@spoh/shared';
import { getMe, getMyPermissions } from './api';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from './useSession';
export const sessionKeys = {
  me: (eventId: string) => [eventId, 'me'] as const,
  permissions: (eventId: string) => [eventId, 'me', 'permissions'] as const,
};
/**
 * The boot call. One request returns identity, capabilities, today's posting
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
