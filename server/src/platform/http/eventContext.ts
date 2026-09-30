import type { NextFunction, Request, Response } from 'express';
import { aliasEvent } from '../event/events.js';
import { NotFoundError } from '../errors/index.js';

/**
 * Event context (ADR-001 §4): which event a request works in, decided by the
 * path and only the path, before authentication resolves the caller's
 * membership of it. Handlers never read an event from the body.
 */

/** An event id as the factory makes them (cuid) or Event #1's backfilled id. */
const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `/api/v1/events/:eventId/…`: the event the path names. */
export function eventFromPath(req: Request, _res: Response, next: NextFunction): void {
  const eventId = req.params.eventId;
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) {
    next(new NotFoundError('Event'));
    return;
  }
  req.requestedEvent = { eventId, fromPath: true };
  next();
}

/**
 * A pre-P09.7 path (`/api/v1/registrations` …): an alias of Event #1's path,
 * served in place rather than redirected, so a queued POST keeps its body and
 * idempotency key (ADR-009 §6). Removed by P16.7.
 */
export async function eventFromAlias(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.requestedEvent = { eventId: (await aliasEvent()).eventId, fromPath: false };
    next();
  } catch (error) {
    next(error);
  }
}
