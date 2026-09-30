'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { ActiveLostPersonResponse, RaiseLostPersonRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { getActiveAlerts, acknowledgeAlert, resolveAlert } from './api';

export const lostPersonKeys = {
  active: (eventId: string) => [eventId, 'lost-person', 'active'] as const,
};
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
  const eventId = useEventId();

  return useQuery({
    queryKey: lostPersonKeys.active(eventId),
    queryFn: () => getActiveAlerts(eventId),
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
  const eventId = useEventId();

  return useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(eventId, alertId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lostPersonKeys.active(eventId) });
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
  const eventId = useEventId();

  return useMutation({
    mutationFn: (input: { alertId: string; outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER' }) =>
      resolveAlert(eventId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lostPersonKeys.active(eventId) });
    },
  });
}

import { raiseLostPerson } from './api';
export function useRaiseLostPerson() {
  const eventId = useEventId();
  return useMutation({
    mutationFn: (body: RaiseLostPersonRequest) => raiseLostPerson(eventId, body),
  });
}
