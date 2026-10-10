'use client';
import type { SessionResponse } from '@spoh/shared';
import { z } from 'zod';
import { loadClientConfiguration } from './env';

const PENDING = '@spoh/client/session-handoff';
const PARAMETERS = ['auth_code', 'auth_state', 'auth_status'];
interface Pending {
  state: string;
  verifier: string;
  startedAt: number;
}
const PendingSchema = z.object({ state: z.string(), verifier: z.string(), startedAt: z.number() });

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function needsSessionHandoff(): Promise<boolean> {
  const config = await loadClientConfiguration();
  return (
    typeof window !== 'undefined' &&
    config.envLabel === 'production' &&
    new URL(config.apiBaseUrl).origin !== window.location.origin
  );
}

function readPending(): Pending | null {
  try {
    const pending = PendingSchema.safeParse(JSON.parse(sessionStorage.getItem(PENDING) ?? 'null'));
    return pending.success ? pending.data : null;
  } catch {
    /* Expired or unavailable tab storage requires a new sign-in. */
  }
  return null;
}

function takeReturn(): { code: string | null; pending: Pending | null } | null {
  const url = new URL(window.location.href);
  if (!PARAMETERS.some((parameter) => url.searchParams.has(parameter))) return null;
  const pending = readPending();
  const matches =
    pending?.state === url.searchParams.get('auth_state') &&
    Date.now() - pending.startedAt >= 0 &&
    Date.now() - pending.startedAt < 120_000;
  const code = matches ? url.searchParams.get('auth_code') : null;
  PARAMETERS.forEach((parameter) => url.searchParams.delete(parameter));
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  sessionStorage.removeItem(PENDING);
  return { code, pending: matches ? pending : null };
}

async function redeemReturn(
  returned: NonNullable<ReturnType<typeof takeReturn>>,
): Promise<SessionResponse | null> {
  if (!returned.code || !returned.pending) return null;
  const config = await loadClientConfiguration();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/auth/handoff`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code: returned.code, verifier: returned.pending.verifier }),
  });
  return response.ok ? ((await response.json()) as SessionResponse) : null;
}

async function redirectToRecovery(): Promise<void> {
  const config = await loadClientConfiguration();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(PENDING, JSON.stringify({ state, verifier, startedAt: Date.now() }));
  const recovery = new URL(`${config.apiBaseUrl}/api/v1/auth/recover`);
  recovery.searchParams.set('challenge', challenge);
  recovery.searchParams.set('state', state);
  recovery.searchParams.set('returnTo', window.location.href);
  window.location.assign(recovery.href);
}

/** The credential stays at the API origin; script receives only a PKCE-bound, one-use code. */
export async function recoverThroughHandoff(): Promise<SessionResponse | null | 'redirecting'> {
  const returned = takeReturn();
  if (returned) return redeemReturn(returned);
  // Signed-out pages stay usable; the hosted sign-in itself establishes the API cookie.
  if (window.location.pathname === '/sign-in') return null;
  await redirectToRecovery();
  return 'redirecting';
}
