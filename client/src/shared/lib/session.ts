'use client';

import type { CommitteeRole, SessionResponse } from '@spoh/shared';
import { ClientConfigurationError, loadClientConfiguration } from '@/shared/lib/env';
import { needsSessionHandoff, recoverThroughHandoff } from './sessionHandoff';
import {
  allowSessionRecovery,
  expectedSessionPerson,
  pinRecoveredPerson,
  rememberSessionPerson,
  rememberSignOut,
  wasSignedOut,
} from './sessionIntent';

/** Tokens stay in memory. Recovery uses the httpOnly API cookie; a cross-site
 * handoff during an active session waits for an explicit renewal to protect forms. */

export interface Session {
  accessToken: string;
  /** `Volunteer.id`: whose captures the outbox may send under this session. */
  volunteerId: string;
  displayName: string;
  role: CommitteeRole;
  expiresAt: number;
  /** False when the server could not set a refresh cookie; a reload will sign out. */
  refreshAvailable: boolean;
  mfaRequired?: boolean;
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
let renewalRequired = false;
let sessionGeneration = 0;

/**
 * Who is signed in on this device, kept when the access token merely expires.
 *
 * `getSession()` withholds an expired token, but the person holding the phone has
 * not changed: a tap made offline after expiry is still theirs. Only an
 * explicit sign-in or sign-out changes it (F04-003).
 */
let volunteerId: string | null = null;

/** The volunteer this device is signed in as, or null after a sign-out. */
export function currentVolunteerId(): string | null {
  return volunteerId;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * A stable snapshot object.
 *
 * `useSyncExternalStore` compares by identity and re-renders forever if the
 * getter allocates. The reference changes only when something really changed.
 */
interface SessionSnapshot {
  status: SessionStatus;
  session: Session | null;
  renewalRequired: boolean;
}
let snapshot: SessionSnapshot = { status, session, renewalRequired };

function publish(): void {
  snapshot = { status, session, renewalRequired };
  for (const listener of listeners) listener();
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot;
}

/** Identifies the local session intent so old requests cannot act as a new sign-in. */
export function getSessionGeneration(): number {
  return sessionGeneration;
}

/** Server-render and first hydration: nothing is known yet. */
export const EMPTY_SNAPSHOT: SessionSnapshot = Object.freeze({
  status: 'unknown' as const,
  session: null,
  renewalRequired: false,
});

export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  // Retain the identity for offline guides, unsent captures and unsaved forms.
  // Live requests still receive no expired credential.
  return hasExpiredSession() ? null : session;
}

export function hasExpiredSession(): boolean {
  return session !== null && session.expiresAt <= Date.now();
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

/** Cache admission only. The worker still respects every HTTP denial from the API. */
export function getOfflineContentToken(): string | null {
  // Connectivity indicators can stay "online" when the API cannot be reached.
  return session?.accessToken ?? null;
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

function applySession(next: Session | null): void {
  session = next;
  renewalRequired = false;
  volunteerId = next?.volunteerId ?? null;
  status = 'ready';

  if (next?.refreshAvailable) scheduleSilentRefresh(next.expiresAt);
  else if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  publish();
}

/** Explicit sign-in/out starts a new intent, even for the same person. */
export function setSession(next: Session | null): void {
  sessionGeneration++;
  if (next) {
    rememberSessionPerson(next.volunteerId);
    allowSessionRecovery();
  }
  applySession(next);
}

/** Local sign-out. `signOut()` below is the one that also clears the cookie. */
export function clearSession(): void {
  setSession(null);
}

export function sessionFromResponse(response: SessionResponse): Session {
  return {
    accessToken: response.accessToken,
    volunteerId: response.volunteer.id,
    displayName: response.volunteer.displayName,
    role: response.volunteer.role,
    expiresAt: Date.now() + response.expiresIn * 1000,
    refreshAvailable: response.refreshAvailable,
    ...('mfaRequired' in response ? { mfaRequired: response.mfaRequired as boolean } : {}),
  };
}

/** Raw auth fetch avoids the API wrapper's 401 recovery cycle. */
async function postAuth(path: string, body?: unknown): Promise<Response> {
  const clientEnv = await loadClientConfiguration();
  return fetch(`${clientEnv.apiBaseUrl}/api/v1/auth${path}`, {
    method: 'POST',
    // The refresh cookie is httpOnly and scoped to this path. Without this it
    // is simply not attached and every refresh looks like an expired session.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : { body: '{}' }),
  });
}

interface RefreshFlight {
  generation: number;
  promise: Promise<Session | null>;
}
/** One flight per session intent prevents rotation races without borrowing another person's flight. */
let inFlight: RefreshFlight | null = null;

function refuseIdentityChange(): null {
  // A late Set-Cookie can replace the browser cookie even when its old JSON was
  // discarded. Keep the current person and require an explicit recovery action.
  sessionGeneration++;
  renewalRequired = true;
  status = 'ready';
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  publish();
  return null;
}

function acceptRecovery(payload: SessionResponse | null, generation: number): Session | null {
  if (generation !== sessionGeneration) return null;
  const expectedPerson = volunteerId ?? expectedSessionPerson();
  if (payload && expectedPerson && payload.volunteer.id !== expectedPerson)
    return refuseIdentityChange();
  const next = payload ? sessionFromResponse(payload) : null;
  // Proven same-person credential rotation keeps pending captures in their
  // original intent. Only establishing or ending a session invalidates them.
  if (!next || !session) sessionGeneration++;
  if (next) pinRecoveredPerson(next.volunteerId);
  applySession(next);
  return next;
}

async function refreshThroughHandoff(allow: boolean, generation: number): Promise<Session | null> {
  if (session && !allow) {
    renewalRequired = true;
    publish();
    return getSession();
  }
  const payload = await recoverThroughHandoff();
  if (generation !== sessionGeneration) return null;
  return payload === 'redirecting' ? session : acceptRecovery(payload, generation);
}

async function refreshThroughCookie(generation: number): Promise<Session | null> {
  const response = await postAuth('/refresh');
  if (generation !== sessionGeneration) return null;
  const payload = response.ok ? ((await response.json()) as SessionResponse) : null;
  return acceptRecovery(payload, generation);
}

async function recoverSession(allowHandoff: boolean, generation: number): Promise<Session | null> {
  try {
    const handoff = await needsSessionHandoff();
    if (generation !== sessionGeneration) return null;
    return await (handoff
      ? refreshThroughHandoff(allowHandoff, generation)
      : refreshThroughCookie(generation));
  } catch (cause) {
    if (generation !== sessionGeneration) return null;
    if (cause instanceof ClientConfigurationError) throw cause;
    // Offline. Keep whatever session we have — the outbox will hold captures
    // and the next attempt happens when the network returns.
    if (!session) {
      status = 'ready';
      publish();
    }
    return getSession();
  }
}

export function refreshSession(allowHandoff = false): Promise<Session | null> {
  const generation = sessionGeneration;
  if (inFlight?.generation === generation) return inFlight.promise;
  const flight: RefreshFlight = { generation, promise: recoverSession(allowHandoff, generation) };
  inFlight = flight;
  flight.promise = flight.promise.finally(() => {
    if (inFlight === flight) inFlight = null;
  });
  return flight.promise;
}

/** Bootstrap callers share recovery, including React StrictMode's second effect (F02-010). */
let bootstrapping: Promise<void> | null = null;

export function bootstrapSession(): Promise<void> {
  if (wasSignedOut()) {
    clearSession();
    return Promise.resolve();
  }
  bootstrapping ??= refreshSession(true)
    .then(() => undefined)
    .catch((cause: unknown) => {
      bootstrapping = null;
      throw cause;
    });
  return bootstrapping;
}

/** A first-party handoff reloads the page, so an active user starts it explicitly. */
export function renewSession(): Promise<Session | null> {
  return refreshSession(true);
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

/** Forget local access immediately, then revoke the cookie family using its last signed proof. */
export async function signOut(): Promise<void> {
  const accessToken = session?.accessToken;
  rememberSignOut();
  // Locally first, synchronously, so the UI is already signed out while the
  // network call is in flight and nothing renders with a stale identity.
  clearSession();

  const clientEnv = await loadClientConfiguration();
  try {
    // Awaited, not fire-and-forget. The cookie is httpOnly, so only the server
    // can clear it — redirecting before this settles leaves a live refresh
    // cookie on a phone that has just been handed to somebody else, and the
    // next page load would silently sign them back in.
    await fetch(`${clientEnv.apiBaseUrl}/api/v1/auth/session`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch {
    // Offline. The in-memory token is already gone and the session row still
    // holds; the cookie stops working when it expires or on the next refresh
    // attempt against a server that can be reached.
  }
}
