import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ERROR_CODES, type ErrorBody } from '@spoh/shared';
import { isProduction } from '../config/env.js';
import { AppError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requestIdOf } from './requestId.js';

/**
 * The single place an error becomes an HTTP response (BUILD_PLAN §7.1, §13).
 *
 * Two rules:
 *  - the response body never carries a stack trace, SQL, or Prisma error text
 *  - every error is logged with the request id, so the generic client message
 *    can always be traced back to the real cause
 */
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalised = normalise(error);
  const requestId = requestIdOf(req);
  const log = logger.child({ requestId, actorSub: req.auth?.sub });

  if (normalised.statusCode >= 500) {
    log.error({ err: error, code: normalised.code }, 'request failed');
  } else {
    log.info({ code: normalised.code, statusCode: normalised.statusCode }, 'request rejected');
  }

  const body: ErrorBody = {
    error: {
      code: normalised.code,
      // An unexposed message is replaced wholesale; this is what keeps
      // "duplicate key value violates unique constraint..." off a phone screen.
      message: normalised.expose ? normalised.message : 'Something went wrong',
      requestId,
      ...(normalised.expose && normalised.details !== undefined
        ? { details: normalised.details }
        : {}),
    },
  };

  res.status(normalised.statusCode).json(body);
};

/** Map anything thrown into the AppError shape. */
function normalise(error: unknown): AppError {
  if (isAppError(error)) return error;

  // Express's own body-parser errors arrive as plain Errors with a status.
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    return new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status === 400
  ) {
    return new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Request body is not valid JSON');
  }

  return new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Something went wrong', {
    cause: error,
    expose: false,
  });
}

/** Terminal 404 handler, mounted after every router. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `No route for ${req.method} ${req.path}`,
      requestId: requestIdOf(req),
    },
  };
  res.status(404).json(body);
}

/**
 * Development convenience: surface the underlying cause in the server log at
 * debug level. Never in the response, and never in production.
 */
export function describeCause(error: unknown): string | undefined {
  if (isProduction) return undefined;
  return error instanceof Error ? error.stack : undefined;
}
