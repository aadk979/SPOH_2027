'use client';

import type { CommitteeRole } from '@spoh/shared';

/**
 * Access-token storage.
 *
 * The token lives in a module-scoped variable — in memory, never in
 * `localStorage` (BUILD_PLAN §6.4). A volunteer's phone is shared, borrowed and
 * occasionally lost, and a token in local storage survives all three plus any
 * XSS that reaches the page.
 *
 * The cost is that a hard refresh loses the session. That is the right trade
 * for a four-day event: signing in again is two taps, and the refresh path is
 * an httpOnly cookie set by the BFF route handler once Cognito is provisioned.
 */

export interface Session {
  accessToken: string;
  displayName: string;
  role: CommitteeRole;
  expiresAt: number;
}

let session: Session | null = null;

/** Notified whenever the session changes, so React can re-render. */
type Listener = (session: Session | null) => void;
const listeners = new Set<Listener>();

export function getSession(): Session | null {
  if (session && session.expiresAt <= Date.now()) {
    // Expired tokens are dropped rather than sent: a 401 mid-capture is a worse
    // experience than being asked to sign in before the shift starts.
    session = null;
  }
  return session;
}

export function setSession(next: Session | null): void {
  session = next;
  for (const listener of listeners) listener(next);
}

export function clearSession(): void {
  setSession(null);
}

export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}
