'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import type { Capability, MeResponse } from '@spoh/shared';
import { api } from '@/lib/api';
import { getSession, subscribeToSession, type Session } from '@/lib/session';

/** Re-renders whenever the in-memory session changes. */
export function useCurrentSession(): Session | null {
  return useSyncExternalStore(
    (onChange) => subscribeToSession(() => onChange()),
    () => getSession(),
    () => null,
  );
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

/** Redirects to sign-in when there is no session. Use on every private page. */
export function useRequireSession(): Session | null {
  const session = useCurrentSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [session, router]);

  return session;
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
