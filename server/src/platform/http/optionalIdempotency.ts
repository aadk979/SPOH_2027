import type { RequestHandler } from 'express';
import { idempotent, type RedactedReplay } from './idempotency.js';

/** Legacy admin clients predate request keys; new clients get retry receipts. */
export function optionalIdempotent(endpoint: string, redacted?: RedactedReplay): RequestHandler {
  const middleware = idempotent(endpoint, redacted ? { redacted } : {});
  return (req, res, next) => {
    const key: unknown = (req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
    if (key === undefined) return next();
    middleware(req, res, next);
  };
}
