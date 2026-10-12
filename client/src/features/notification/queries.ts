'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentSession } from '@/features/session';
import { ApiError } from '@/shared/lib/apiErrors';
import { getSessionGeneration } from '@/shared/lib/session';
import { getNoticePreference, listNotices, markNoticeRead, noticeDetail,
  saveNoticePreference, unregisterPush } from './api';
import { rememberRegistered } from './pushSync';
import { usePushConfig } from './hooks/usePushConfig';
import { deviceOwnerFence, subscribeCurrentDevice } from './hooks/deviceGestures';

/**
 * Push registration.
 *
 * ── Why this is not automatic ───────────────────────────────────────────────
 *
 * Browsers require a user gesture for the notification prompt, and a prompt
 * that appears the instant an app opens is the one people dismiss forever
 * without reading. So this exposes state and an `enable()` the UI calls from a
 * button, and never asks on its own.
 *
 * ── Why a failure here is not an error ──────────────────────────────────────
 *
 * Push is best effort by design: the ten-second lost-person poll and the
 * three-second dashboard poll are the delivery guarantee. A volunteer on an
 * older iPhone, in a browser with notifications blocked, or behind a push
 * service the network drops still gets every alert — a moment later, and only
 * while the app is open. So every path below degrades to `unsupported` or
 * `denied` and the app carries on.
 */

export type { PushState } from './pushTypes';
import type { PushState } from './pushTypes';

/**
 * VAPID keys travel as base64url; `applicationServerKey` wants raw bytes.
 *
 * Returns an `ArrayBuffer` rather than a `Uint8Array`: the DOM types narrow the
 * field to a view over a plain `ArrayBuffer`, and a `Uint8Array` — whose backing
 * buffer may be a `SharedArrayBuffer` — does not satisfy that.
 */

export interface UsePushRegistrationResult {
  state: PushState;
  /** Ask for permission and register. Call from a click, never on mount. */
  enable(): Promise<void>;
  disable(): Promise<void>;
  error: string | null;
}

export function usePushRegistration(): UsePushRegistrationResult {
  const { state, setState, publicKey } = usePushConfig();
  const [error, setError] = useState<string | null>(null);

  const enable = useCallback(async (): Promise<void> => {
    const { personId, current } = deviceOwnerFence();
    setError(null);

    if (!publicKey) return;

    try {
      const subscription = await subscribeCurrentDevice({ publicKey, current });
      if (subscription.state === 'STALE') return;
      if (subscription.state === 'DENIED') { setState('denied'); return; }
      rememberRegistered(personId ?? null, subscription.endpoint);
      setState('subscribed');
    } catch {
      if (!current()) return;
      setError('Could not turn on alerts on this device. You will still see them in the app.');
      setState('prompt');
    }
  }, [publicKey]);

  const disable = useCallback(async (): Promise<void> => {
    const generation = getSessionGeneration();
    const current = () => generation === getSessionGeneration();
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || !current()) return;

      // Tell the server first: a subscription we forget about server-side keeps
      // consuming a delivery attempt on every urgent broadcast, forever.
      await unregisterPush(subscription.endpoint);
      if (!current()) return;
      await subscription.unsubscribe();
      if (!current()) return;
      rememberRegistered(null, null);
      setState('prompt');
    } catch {
      if (!current()) return;
      setError('Could not turn alerts off. Try again, or check your browser settings.');
    }
  }, []);

  return { state, enable, disable, error };
}
export const noticeKeys = {
  owner: (personId: string | undefined) => ['person', personId ?? 'signed-out', 'notification-centre'] as const,
  list: (personId: string | undefined, eventId: string | undefined, unreadOnly: boolean) =>
    [...noticeKeys.owner(personId), 'list', eventId ?? 'all', unreadOnly] as const,
  detail: (personId: string | undefined, id: string) => [...noticeKeys.owner(personId), 'detail', id] as const,
  preferences: (personId: string | undefined) => [...noticeKeys.owner(personId), 'preferences'] as const,
};

/** Only memory holds these projections; switching owners removes even inactive pages. */
function useNoticeOwner() {
  const client = useQueryClient();
  const personId = useCurrentSession()?.volunteerId;
  const previous = useRef(personId);
  useEffect(() => {
    if (previous.current !== personId) {
      const key = noticeKeys.owner(previous.current);
      void client.cancelQueries({ queryKey: key });
      client.removeQueries({ queryKey: key });
      previous.current = personId;
    }
    return () => { void client.cancelQueries({ queryKey: noticeKeys.owner(personId) }); };
  }, [client, personId]);
  return { personId, client };
}

function useDropDenied(error: unknown, key: readonly unknown[]) {
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status))
      client.removeQueries({ queryKey: key });
  }, [client, error, key]);
}

export function useNoticeList(input: { eventId?: string; unreadOnly: boolean }) {
  const { personId } = useNoticeOwner();
  const key = noticeKeys.list(personId, input.eventId, input.unreadOnly);
  const query = useInfiniteQuery({ queryKey: key, enabled: !!personId,
    queryFn: ({ pageParam, signal }) => listNotices({ ...input, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.meta.nextCursor ?? undefined,
    gcTime: 0, staleTime: 0, refetchOnWindowFocus: true });
  useDropDenied(query.error, key);
  return query;
}
export function useNoticeDetail(id: string) {
  const { personId } = useNoticeOwner();
  const key = noticeKeys.detail(personId, id);
  const query = useQuery({ queryKey: key, enabled: !!personId && !!id,
    queryFn: ({ signal }) => noticeDetail(id, signal), gcTime: 0, staleTime: 0 });
  useDropDenied(query.error, key);
  return query;
}
export function useNoticePreference() {
  const { personId } = useNoticeOwner();
  const key = noticeKeys.preferences(personId);
  const query = useQuery({ queryKey: key, enabled: !!personId,
    queryFn: ({ signal }) => getNoticePreference(signal), gcTime: 0, staleTime: 0 });
  useDropDenied(query.error, key);
  return query;
}
function useNoticeWrite<Variables, Result>(write: (variables: Variables) => Promise<Result>) {
  const { personId, client } = useNoticeOwner();
  return useMutation({ gcTime: 0, mutationFn: async (variables: Variables) => {
    const generation = getSessionGeneration();
    const result = await write(variables);
    if (generation !== getSessionGeneration()) throw new Error('Your session changed. Review this action again.');
    return result;
  }, onSuccess: () => client.invalidateQueries({ queryKey: noticeKeys.owner(personId) }),
  onError: async () => {
    await client.cancelQueries({ queryKey: noticeKeys.owner(personId) });
    client.removeQueries({ queryKey: noticeKeys.owner(personId) });
  } });
}
export const useMarkNoticeRead = () => useNoticeWrite(markNoticeRead);
export const useSaveNoticePreference = () => useNoticeWrite(saveNoticePreference);
