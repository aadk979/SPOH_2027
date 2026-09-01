'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ActiveLostPersonResponse } from '@spoh/shared';
import { api } from '@/lib/api';
import { useCurrentSession } from '../session/useSession';

/**
 * Active lost-person alerts.
 *
 * Polled every 10 seconds on every device, everywhere in the app. Web Push is
 * Phase 3 and is best effort when it lands; this poll is the contract
 * (BUILD_PLAN §7.3). It keeps running in the background so the banner appears
 * on whatever screen the volunteer happens to be looking at.
 */
const POLL_INTERVAL_MS = 10_000;

export function useActiveAlerts(): UseQueryResult<ActiveLostPersonResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['lost-person', 'active'],
    queryFn: () => api<ActiveLostPersonResponse>('/lost-person/active'),
    enabled: session !== null,
    refetchInterval: POLL_INTERVAL_MS,
    // Keep polling when the tab is backgrounded: a phone in a pocket is still
    // a phone that should buzz when a child goes missing.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useAcknowledgeAlert(): ReturnType<typeof useMutation<unknown, Error, string>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) => api(`/lost-person/${alertId}/ack`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lost-person', 'active'] });
    },
  });
}
