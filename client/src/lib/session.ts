'use client';

import type { Capability, CommitteeRole, SessionResponse } from '@spoh/shared';
import { clientEnv } from './env';

/**
 * Access-token storage and session recovery.
 *
 * The token lives in a module-scoped variable — in memory, never in
 * `localStorage` (BUILD_PLAN §6.4). A volunteer's phone is shared, borrowed and
 * occasionally lost, and a token in local storage survives all three plus any
 * XSS that reaches the page.
 *
 * That used to mean a hard refresh signed you out. It no longer does. The API
 * issues a short-lived access token alongside an httpOnly refresh cookie that
 * page script cannot read, so a reload recovers the session by asking the
 * server — without the long-lived credential ever being reachable from
 * JavaScript. The security property is unchanged; only the papercut is gone.
 *
 * Three things happen here:
 *
 *   bootstrap        once on load: try to recover a session from the cookie
 *   silent refresh   a timer, so a token never expires mid-shift
 *   401 recovery     one retry after a refresh, driven from `api.ts`
 */

export interface Session {
  accessToken: string;
  displayName: string;
  role: CommitteeRole;
  capabilities: Capability[];
  expiresAt: number;
  /** False when the server could not set a refresh cookie; a reload will sign out. */
  refreshAvailable: boolean;
}

/**
 * `unknown` until the first refresh attempt settles.
 *
 * This distinction is load-bearing: without it every guarded page would see
 * `null` on first paint and bounce to sign-in before the recovery call had even
 * left the device, which is precisely the behaviour this exists to remove.
 */
export type SessionStatus = 'unknown' | 'ready';

let session: Session | null = null;
let status: SessionStatus = 'unknown';

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * A stable snapshot object.
 *
 * `useSyncExternalStore` compares by identity and re-renders forever if the
 * getter allocates. The reference changes only when something really changed.
 */
let snapshot: { status: SessionStatus; session: Session | null } = { status, session };

function publish(): void {
  snapshot = { status, session };
  for (const listener of listeners) listener();
}

export function getSessionSnapshot(): { status: SessionStatus; session: Session | null } {
  return snapshot;
}

/** Server-render and first hydration: nothing is known yet. */
export const EMPTY_SNAPSHOT: { status: SessionStatus; session: Session | null } = Object.freeze({
  status: 'unknown' as const,
  session: null,
});

export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  if (session && session.expiresAt <= Date.now()) {
    // An expired token is dropped rather than sent: a 401 mid-capture is a
    // worse experience than a refresh the volunteer never sees.
    session = null;
    publish();
  }
  return session;
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Renew a minute before expiry, and never sooner than ten seconds from now.
 *
 * The floor matters: a server misconfigured with a very short token lifetime
 * would otherwise turn this into a refresh loop hammering the API.
 */
function scheduleSilentRefresh(expiresAt: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const delay = Math.max(10_000, expiresAt - Date.now() - 60_000);
  refreshTimer = setTimeout(() => {
    void refreshSession();
  }, delay);
}

export function setSession(next: Session | null): void {
  session = next;
  status = 'ready';

  if (next?.refreshAvailable) scheduleSilentRefresh(next.expiresAt);
  else if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  publish();
}

/** Local sign-out. `signOut()` below is the one that also clears the cookie. */
export function clearSession(): void {
  setSession(null);
}

export function sessionFromResponse(response: SessionResponse): Session {
  return {
    accessToken: response.accessToken,
    displayName: response.volunteer.displayName,
    role: response.volunteer.role,
    capabilities: response.capabilities,
    expiresAt: Date.now() + response.expiresIn * 1000,
    refreshAvailable: response.refreshAvailable,
  };
}

/**
 * Raw fetch rather than the `api` wrapper.
 *
 * `api` calls back into this module on a 401, so routing the refresh through it
 * would be a cycle: a failed refresh would trigger a refresh.
 */
async function postAuth(path: string, body?: unknown): Promise<Response> {
  return fetch(`${clientEnv.apiBaseUrl}/api/v1/auth${path}`, {
    method: 'POST',
    // The refresh cookie is httpOnly and scoped to this path. Without this it
    // is simply not attached and every refresh looks like an expired session.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : { body: '{}' }),
  });
}

/**
 * One refresh at a time.
 *
 * Several queries can 401 together when a token expires; without this they
 * would each rotate the refresh token, and rotation is single-use — the second
 * would present an already-rotated token, which the server correctly reads as a
 * leak and revokes the whole family. Sharing one in-flight promise is what
 * keeps a burst of 401s from signing the volunteer out.
 */
let inFlight: Promise<Session | null> | null = null;

export function refreshSession(): Promise<Session | null> {
  inFlight ??= (async () => {
    try {
      const response = await postAuth('/refresh');

      if (!response.ok) {
        setSession(null);
        return null;
      }

      const payload = (await response.json()) as SessionResponse;
      const next = sessionFromResponse(payload);
      setSession(next);
      return next;
    } catch {
      // Offline. Keep whatever session we have — the outbox will hold captures
      // and the next attempt happens when the network returns.
      if (!session) {
        status = 'ready';
        publish();
      }
      return session;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Recover a session on page load. Safe to call more than once; only the first
 * call does any work.
 */
let bootstrapped = false;

export async function bootstrapSession(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  await refreshSession();
}

/** Sign in. Returns the session so the caller can route immediately. */
export async function openSession(credentials: {
  email?: string;
  providerAccessToken?: string;
  role?: CommitteeRole;
}): Promise<Session> {
  const response = await postAuth('/session', credentials);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;

    const error = new Error(payload?.error?.message ?? 'Could not sign in');
    (error as Error & { code?: string; status?: number }).code = payload?.error?.code;
    (error as Error & { code?: string; status?: number }).status = response.status;
    throw error;
  }

  const next = sessionFromResponse((await response.json()) as SessionResponse);
  setSession(next);
  return next;
}

/**
 * Sign out everywhere it matters: the in-memory token, the refresh cookie, and
 * the server-side session row. A local-only sign-out would leave a cookie that
 * silently restores the session on the next load — on a phone that has just
 * been handed to somebody else.
 */
export async function signOut(): Promise<void> {
  // Locally first, synchronously, so the UI is already signed out while the
  // network call is in flight and nothing renders with a stale identity.
  clearSession();

  try {
    // Awaited, not fire-and-forget. The cookie is httpOnly, so only the server
    // can clear it — redirecting before this settles leaves a live refresh
    // cookie on a phone that has just been handed to somebody else, and the
    // next page load would silently sign them back in.
    await fetch(`${clientEnv.apiBaseUrl}/api/v1/auth/session`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    // Offline. The in-memory token is already gone and the session row still
    // holds; the cookie stops working when it expires or on the next refresh
    // attempt against a server that can be reached.
  }
}
