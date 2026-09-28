'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ActiveLostPersonResponse } from '@spoh/shared';
import { getActiveAlerts, acknowledgeAlert, resolveAlert } from './api';

export const lostPersonKeys = { active: ['lost-person', 'active'] as const };
import { ms } from '@/shared/lib/runtimeSettings';
import { useCurrentSession } from '@/features/session';

/**
 * Active lost-person alerts.
 *
 * Polled on every device, everywhere in the app, at a cadence that is a runtime
 * setting and defaults to ten seconds. Web Push is best effort by design; this
 * poll is the contract (BUILD_PLAN §7.3). It keeps running in the background so
 * the banner appears on whatever screen the volunteer happens to be looking at.
 */
export function useActiveAlerts(): UseQueryResult<ActiveLostPersonResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: lostPersonKeys.active,
    queryFn: getActiveAlerts,
    enabled: session !== null,
    refetchInterval: ms.alertPoll(),
    // Keep polling when the tab is backgrounded: a phone in a pocket is still
    // a phone that should buzz when a child goes missing.
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

export function useAcknowledgeAlert(): ReturnType<typeof useMutation<unknown, Error, string>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lostPersonKeys.active });
    },
  });
}

/**
 * Resolve an alert. IC and above only.
 *
 * Without this the alert would sit on every device in the building until the
 * purge job ran, long after the child was found — and the next real alert would
 * arrive into a screen people had already learned to ignore.
 */
export function useResolveAlert(): ReturnType<
  typeof useMutation<
    unknown,
    Error,
    { alertId: string; outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER' }
  >
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lostPersonKeys.active });
    },
  });
}

import { raiseLostPerson } from './api';
export function useRaiseLostPerson() {
  return useMutation({ mutationFn: raiseLostPerson });
}
