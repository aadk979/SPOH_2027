'use client';

import type { ErrorBody } from '@spoh/shared';
import { clientEnv } from './env';
import { clearSession, getAccessToken, refreshSession } from './session';

/**
 * Typed fetch wrapper.
 *
 * Every call goes through here so that authorization, error shape, token
 * renewal and the request-id correlation are handled in exactly one place. The
 * client talks to the Express API directly — there is no Next.js proxy in front
 * of it (BUILD_PLAN §9.1).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly details: unknown;

  constructor(status: number, body: ErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
  }

  /**
   * Worth retrying from the outbox. A 4xx will fail identically forever, so
   * retrying one just burns battery; a 5xx or a network failure will not.
   */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/** A failure before the server was reached — a dead spot, a sleeping radio. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Could not reach the server', { cause });
    this.name = 'NetworkError';
  }

  readonly isRetryable = true;
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(path: string, options: ApiRequest, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }
}

export async function api<T>(path: string, options: ApiRequest = {}): Promise<T> {
  let response = await send(path, options, getAccessToken());

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
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const renewed = await refreshSession();

    if (renewed) {
      response = await send(path, options, renewed.accessToken);
    }
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload as ErrorBody | null)?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId: response.headers.get('x-request-id') ?? 'unknown',
    };

    // Still unauthenticated after a refresh: the session is genuinely over.
    // Drop it so the app routes to sign-in rather than retrying forever.
    if (response.status === 401) clearSession();

    throw new ApiError(response.status, body);
  }

  return payload as T;
}

/** True for errors an outbox flush should retry rather than give up on. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.isRetryable;
  if (error instanceof NetworkError) return true;
  return false;
}
