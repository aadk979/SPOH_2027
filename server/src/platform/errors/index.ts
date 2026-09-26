import { ERROR_CODES, type ErrorCode } from '@spoh/shared';

/**
 * The error hierarchy (BUILD_PLAN §13).
 *
 * Handlers throw these; `platform/http/errorHandler.ts` is the only place that
 * turns one into an HTTP response. Nothing in the codebase calls
 * `res.status(500).send(err.message)` — that is how SQL text and stack traces
 * end up on a volunteer's phone.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  /** Structured, client-safe context. Never contains SQL, tokens or stack data. */
  readonly details: unknown;
  /** Whether the message is safe to show a user. Internal errors are not. */
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; cause?: unknown; expose?: boolean } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request failed validation', details?: unknown) {
    super(400, ERROR_CODES.VALIDATION_FAILED, message, { details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, ERROR_CODES.UNAUTHENTICATED, message);
  }
}

/**
 * The token verified, but no `Volunteer` row matches its subject. The account
 * exists in the identity provider and not on the roster — an operational
 * problem, not a security one, and the distinct code lets the client say so.
 */
export class NotProvisionedError extends AppError {
  constructor(message = 'This account is not on the volunteer roster') {
    super(403, ERROR_CODES.NOT_PROVISIONED, message);
  }
}

export class AccountInactiveError extends AppError {
  constructor(message = 'This account has been deactivated') {
    super(403, ERROR_CODES.ACCOUNT_INACTIVE, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', details?: unknown) {
    super(403, ERROR_CODES.FORBIDDEN, message, { details });
  }
}

/** Layer 2 of RBAC: right capability, wrong station (BUILD_PLAN §6.3). */
export class StationScopeError extends AppError {
  constructor(message = 'You are not assigned to this station for the current shift') {
    super(403, ERROR_CODES.STATION_SCOPE_DENIED, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, ERROR_CODES.NOT_FOUND, `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(409, code, message, { details });
  }
}

export class IdempotencyKeyReuseError extends AppError {
  constructor() {
    super(
      409,
      ERROR_CODES.IDEMPOTENCY_KEY_REUSE,
      'This idempotency key was already used for a different request',
    );
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, ERROR_CODES.RATE_LIMITED, message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Something went wrong', cause?: unknown) {
    super(500, ERROR_CODES.INTERNAL_ERROR, message, { cause, expose: false });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', cause?: unknown) {
    super(503, ERROR_CODES.SERVICE_UNAVAILABLE, message, { cause, expose: false });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
