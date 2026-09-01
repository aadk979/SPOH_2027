import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Zod validation for every route (BUILD_PLAN §8.3).
 *
 * A route without a validator fails code review. Object schemas in
 * `@spoh/shared` are `.strict()`, so an unknown key is an error rather than
 * something silently dropped — which is what stops a client from sending a
 * `role` or `volunteerId` and hoping a handler reads it.
 *
 * The parsed value replaces the raw one, so handlers see coerced, typed data.
 */
export interface ValidationTargets {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (targets.body) req.body = parseOrThrow(targets.body, req.body, 'body');

      if (targets.query) {
        // Express 5 exposes `req.query` as a getter-only property, so the
        // parsed result is stashed alongside it rather than assigned over it.
        Object.defineProperty(req, 'validatedQuery', {
          value: parseOrThrow(targets.query, req.query, 'query'),
          configurable: true,
          enumerable: false,
          writable: true,
        });
      }

      if (targets.params) {
        Object.defineProperty(req, 'validatedParams', {
          value: parseOrThrow(targets.params, req.params, 'params'),
          configurable: true,
          enumerable: false,
          writable: true,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function parseOrThrow(schema: z.ZodType, value: unknown, location: string): unknown {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ValidationError(`Invalid request ${location}`, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  return result.data;
}

/** Typed accessor for a body validated by `validate({ body })`. */
export function validatedBody<T>(req: Request): T {
  return req.body as T;
}

/** Typed accessor for a query validated by `validate({ query })`. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}

/** Typed accessor for params validated by `validate({ params })`. */
export function validatedParams<T>(req: Request): T {
  return (req as Request & { validatedParams: T }).validatedParams;
}
