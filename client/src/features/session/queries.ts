'use client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@spoh/shared';
import { getMe } from './api';
import { useEventId } from '@/shared/lib/eventContext';
import { useCurrentSession } from './useSession';
export const sessionKeys = { me: (eventId: string) => [eventId, 'me'] as const };
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
