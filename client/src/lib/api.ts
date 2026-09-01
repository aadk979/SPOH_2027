'use client';

import type { ErrorBody } from '@spoh/shared';
import { clientEnv } from './env';
import { clearSession, getAccessToken } from './session';

/**
 * Typed fetch wrapper.
 *
 * Every call goes through here so that authorization, error shape and the
 * request-id correlation are handled in exactly one place. The client talks to
 * the Express API directly — there is no Next.js proxy in front of it
 * (BUILD_PLAN §9.1).
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

export async function api<T>(path: string, options: ApiRequest = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const token = getAccessToken();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;

  try {
    response = await fetch(`${clientEnv.apiBaseUrl}/api/v1${path}`, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload as ErrorBody | null)?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId: response.headers.get('x-request-id') ?? 'unknown',
    };

    // An expired or revoked token: drop it so the app routes to sign-in rather
    // than retrying a request that can never succeed.
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
