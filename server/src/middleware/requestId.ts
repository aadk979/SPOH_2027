import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Header a load balancer or the client may use to supply a correlation id. */
const REQUEST_ID_HEADER = 'x-request-id';

/** Reject anything that is not a short, printable, log-safe token. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Assigns every request a correlation id, echoed back on the response and
 * attached to every log line and error envelope (BUILD_PLAN §8.7).
 *
 * An inbound id is honoured only if it looks like an id. Accepting arbitrary
 * header content here would let a client inject newlines into the log stream.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.get(REQUEST_ID_HEADER);
  const id = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/**
 * Read the correlation id as a string.
 *
 * pino-http types `req.id` as `ReqId` (string | number | object) because it
 * allows arbitrary generators. Ours is always a string, but the declaration is
 * shared, so every reader goes through here rather than asserting.
 */
export function requestIdOf(req: Request): string {
  return typeof req.id === 'string' ? req.id : String(req.id);
}
