'use client';

import type { ErrorBody } from '@spoh/shared';
import { ApiError, NetworkError } from './apiErrors';
export { ApiError, NetworkError } from './apiErrors';
import { loadClientConfiguration } from '@/shared/lib/env';
import {
  clearSession,
  getAccessToken,
  getOfflineContentToken,
  getSessionGeneration,
  hasExpiredSession,
  refreshSession,
} from '@/shared/lib/session';

/**
 * Typed fetch wrapper.
 *
 * Every call goes through here so that authorization, error shape, token
 * renewal and the request-id correlation are handled in exactly one place. The
 * client talks to the Express API directly — there is no Next.js proxy in front
 * of it (docs/adr/ADR-007-code-architecture.md).
 */

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  cache?: 'no-store';
  credentials?: RequestCredentials;
  /** Authenticated, immutable guide reads may use the in-memory proof for offline cache access. */
  offlineContent?: true;
}

function requestToken(path: string, options: ApiRequest): string | null {
  const immutable =
    /^\/events\/[^/]+\/content(?:\?v=[A-Za-z0-9_-]+|\/assets\/[^/]+\/map-\d+)$/.test(path);
  return options.offlineContent && immutable && (!options.method || options.method === 'GET')
    ? getOfflineContentToken()
    : getAccessToken();
}

interface ApiInvocation {
  path: string;
  options: ApiRequest;
  generation: number;
}

function assertSessionCurrent(generation: number): void {
  if (generation === getSessionGeneration()) return;
  throw new ApiError(401, {
    code: 'SESSION_EXPIRED',
    message: 'Your session changed. Review this action and try again.',
    requestId: 'client-session-changed',
  });
}

async function send(invocation: ApiInvocation, token: string | null): Promise<Response> {
  const { path, options } = invocation;
  const clientEnv = await loadClientConfiguration();
  assertSessionCurrent(invocation.generation);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.credentials ? { credentials: options.credentials } : {}),
      ...(options.cache ? { cache: options.cache } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    assertSessionCurrent(invocation.generation);
    throw new NetworkError(cause);
  }
}

async function responseFor(invocation: ApiInvocation): Promise<Response> {
  const { path, options } = invocation;
  let response = await send(invocation, requestToken(path, options));
  assertSessionCurrent(invocation.generation);
  /**
   * One transparent retry after a refresh.
   *
   * The access token is short-lived, and a phone that slept through its expiry
   * wakes up holding a dead one. Renewing and retrying here means the volunteer
   * sees a capture succeed rather than a sign-in screen.
   *
   * Bounded to a single attempt, and skipped for the auth routes themselves —
   * refreshing in response to a failed refresh is a loop, not a recovery.
   */
  if (
    response.status === 401 &&
    !path.startsWith('/auth/') &&
    invocation.generation === getSessionGeneration()
  ) {
    const renewed = await refreshSession();

    if (renewed && invocation.generation === getSessionGeneration()) {
      // Same-person rotation preserves this intent; explicit sign-in/out does not.
      const token = getAccessToken();
      if (token) response = await send(invocation, token);
    }
  }
  assertSessionCurrent(invocation.generation);
  return response;
}

export async function api<T>(path: string, options: ApiRequest = {}): Promise<T> {
  const invocation = { path, options, generation: getSessionGeneration() };
  const response = await responseFor(invocation);
  assertSessionCurrent(invocation.generation);
  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  assertResponseOk(response, payload, invocation.generation);

  return payload as T;
}

/** Authenticated images use the same renewal and error handling as JSON reads. */
export async function apiBlob(
  path: string,
  options: Pick<ApiRequest, 'offlineContent'> = {},
): Promise<Blob> {
  const invocation: ApiInvocation = {
    path,
    options: { ...options, cache: 'no-store' },
    generation: getSessionGeneration(),
  };
  const response = await responseFor(invocation);
  if (!response.ok)
    assertResponseOk(response, await response.json().catch(() => null), invocation.generation);
  const blob = await response.blob();
  assertSessionCurrent(invocation.generation);
  return blob;
}

/** True for errors an outbox flush should retry rather than give up on. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.isRetryable;
  if (error instanceof NetworkError) return true;
  return false;
}

function assertResponseOk(response: Response, payload: unknown, generation: number): void {
  assertSessionCurrent(generation);
  if (!response.ok) {
    const body = (payload as ErrorBody | null)?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId: response.headers.get('x-request-id') ?? 'unknown',
    };

    // Still unauthenticated after a refresh: the session is genuinely over.
    // Drop it so the app routes to sign-in rather than retrying forever.
    if (
      response.status === 401 &&
      generation === getSessionGeneration() &&
      !hasExpiredSession()
    )
      clearSession();

    throw new ApiError(response.status, body);
  }
}
