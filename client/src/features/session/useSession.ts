'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import type { Capability, MeResponse } from '@spoh/shared';
import { api } from '@/lib/api';
import {
  EMPTY_SNAPSHOT,
  getSessionSnapshot,
  subscribeToSession,
  type Session,
  type SessionStatus,
} from '@/lib/session';

/** Re-renders whenever the in-memory session changes. */
export function useSessionState(): { status: SessionStatus; session: Session | null } {
  return useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    // Server render and first hydration: nothing is known yet, and claiming a
    // session here would flash the signed-in shell before the recovery call.
    () => EMPTY_SNAPSHOT,
  );
}

export function useCurrentSession(): Session | null {
  return useSessionState().session;
}

/**
 * The boot call. One request returns identity, capabilities, today's posting
 * and the escalation chain, so the home screen renders without a waterfall.
 */
export function useMe(): UseQueryResult<MeResponse> {
  const session = useCurrentSession();

  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeResponse>('/me'),
    enabled: session !== null,
    staleTime: 30_000,
  });
}

/**
 * Redirects to sign-in when there is no session. Use on every private page.
 *
 * Waits for `status === 'ready'` before redirecting. On a hard refresh the
 * session is recovered from the httpOnly cookie, and that call has not finished
 * on first paint — redirecting on a merely-unknown session would bounce every
 * reload to the sign-in screen, which is the exact papercut the refresh path
 * exists to remove.
 */
export function useRequireSession(): Session | null {
  const { status, session } = useSessionState();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unknown' || session !== null) return;

    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }, [status, session, router]);

  return session;
}

/**
 * Whether the session recovery call has settled.
 *
 * Callers that render an empty state for a signed-out volunteer want this, so
 * they can hold a skeleton for the fraction of a second the refresh takes
 * rather than flashing "nothing here" at somebody who is in fact signed in.
 */
export function useSessionStatus(): SessionStatus {
  return useSessionState().status;
}

/**
 * Capability check for UI affordance only.
 *
 * Hiding a tile the volunteer cannot use saves them a tap and keeps the home
 * screen honest. It is never the authorization — the server re-checks every
 * call against the same matrix (BUILD_PLAN §6.4).
 */
export function useCan(me: MeResponse | undefined, capability: Capability): boolean {
  return me?.capabilities.includes(capability) ?? false;
}
