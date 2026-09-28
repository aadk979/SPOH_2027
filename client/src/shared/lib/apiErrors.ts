import type { ErrorBody } from '@spoh/shared';

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
   *
   * One 409 is not permanent: `IDEMPOTENCY_IN_PROGRESS` means the server holds
   * the key for a request that has not settled, typically because it restarted
   * mid-request, and lets a retry through within a minute (F03-033).
   */
  get isRetryable(): boolean {
    if (this.status === 409) return this.code === 'IDEMPOTENCY_IN_PROGRESS';
    return this.status >= 500 || this.status === 429;
  }

  /** The session is over and the refresh failed: nothing succeeds until sign-in. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
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
