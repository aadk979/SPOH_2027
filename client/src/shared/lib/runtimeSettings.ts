'use client';

import { useSyncExternalStore } from 'react';
import {
  ClientSettings,
  GENERATED_SETTING_DEFAULTS,
  type ClientSettingsResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { currentVolunteerId, getSession, subscribeToSession } from '@/shared/lib/session';

/**
 * The client's copy of the runtime settings.
 *
 * The poll intervals, the undo window, the send grace period and the outbox
 * warning thresholds were hard-coded on both sides of the wire, which meant
 * changing one required changing two files and shipping both. Worse, they could
 * silently disagree: a server that considers a station silent after ten minutes
 * and a client that says fifteen are describing different events.
 *
 * They are an event's settings now (P10.2), so the copy belongs to one person
 * working in one event: the signed-in volunteer and the event page they have
 * open. It is fetched once for that pair and cached in memory. Every reader has
 * a compiled default, so nothing waits on the request and a server that cannot
 * be reached simply behaves the way it always did.
 */

/** Compiled defaults: the values the client shipped with, from the registry's generated contracts. */
export const DEFAULT_CLIENT_SETTINGS: Readonly<ClientSettings> = Object.freeze(
  Object.fromEntries(
    Object.keys(ClientSettings.shape).map((key) => [
      key,
      GENERATED_SETTING_DEFAULTS[key as keyof ClientSettings],
    ]),
  ) as ClientSettings,
);

let cache: Readonly<ClientSettings> = DEFAULT_CLIENT_SETTINGS;

const listeners = new Set<() => void>();

export function getClientSettings(): Readonly<ClientSettings> {
  return cache;
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The settings for a component that must re-render when they arrive. */
export function useClientSettings(): Readonly<ClientSettings> {
  return useSyncExternalStore(
    subscribeToSettings,
    getClientSettings,
    () => DEFAULT_CLIENT_SETTINGS,
  );
}

/** Milliseconds, for the many places that want a timer rather than a number. */
export const ms = {
  dashboardPoll: (): number => cache.dashboardPollSeconds * 1000,
  alertPoll: (): number => cache.alertPollSeconds * 1000,
  undoWindow: (): number => cache.captureUndoWindowSeconds * 1000,
  sendGrace: (): number => cache.captureSendGraceSeconds * 1000,
  outboxWarningAge: (): number => cache.outboxWarningAgeMinutes * 60_000,
};

/**
 * A paged list's poll. Each refresh re-fetches every loaded page, so the interval grows with
 * them: a list costs about one request per interval however far it is paged, rather than
 * enough to reach a person's rate limit with the screen alone.
 */
export function pagedPoll(interval: () => number) {
  return (query: { state: { data?: { pages: readonly unknown[] } } }): number =>
    interval() * Math.max(1, query.state.data?.pages.length ?? 1);
}

function publish(next: Readonly<ClientSettings>): void {
  if (next === cache) return;
  cache = next;
  for (const listener of listeners) listener();
}

/** The event page open on this device, or null before one has been. */
let selectedEventId: string | null = null;
/** Whose settings the cache holds or is fetching: `person` + `event`, or null. */
let owner: string | null = null;
let state: 'idle' | 'loading' | 'ready' = 'idle';
let watching = false;

function ownerKey(): string | null {
  const person = currentVolunteerId();
  return person && selectedEventId ? `${person}\u0000${selectedEventId}` : null;
}

/**
 * Bring the cache in line with who is signed in and which event is open.
 *
 * A different person or event drops the previous copy at once: one volunteer's
 * event must never tune another's device. A signed-out page load has nothing to
 * read with (F02-010); an expired token keeps the person (F04-003), so it keeps
 * their copy and fetches once a token is back.
 */
function sync(): void {
  const next = ownerKey();
  if (next !== owner) {
    owner = next;
    state = 'idle';
    publish(DEFAULT_CLIENT_SETTINGS);
  }
  if (!next || state !== 'idle' || !getSession()) return;
  state = 'loading';
  void fetchFor(next, selectedEventId!);
}

/**
 * Deliberately total: any failure leaves the defaults in place and a later
 * session change retries. A volunteer whose settings request failed should get
 * an app that behaves normally, not one that refuses to start because it could
 * not read a poll interval. An answer for an owner who has since changed is
 * discarded, however late it arrives.
 */
async function fetchFor(requestedFor: string, eventId: string): Promise<void> {
  try {
    const response = await eventApi<ClientSettingsResponse>(eventId, '/admin/settings/client');
    const settings = ClientSettings.parse(response.settings);
    if (owner !== requestedFor) return;
    state = 'ready';
    publish(Object.freeze(settings));
  } catch {
    // Defaults stand. Nothing to tell the volunteer — they cannot act on it.
    if (owner === requestedFor) state = 'idle';
  }
}

/** Start following the session; called once the runtime configuration is accepted. */
export function loadClientSettings(): void {
  if (!watching) {
    watching = true;
    subscribeToSession(sync);
  }
  sync();
}

/** The event page now open; its settings replace any other event's. */
export function selectClientSettingsEvent(eventId: string): void {
  selectedEventId = eventId;
  sync();
}
