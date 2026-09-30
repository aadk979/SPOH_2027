import type { NextFunction, Request, Response } from 'express';
import { UnauthenticatedError } from '../errors/index.js';
import { authenticate } from '../identity/index.js';
import { aliasEvent } from '../event/events.js';
import type { RequestAuth } from '../../types/express.js';
import type { EventScope } from '../db/eventScope.js';
import { requestIdOf } from './requestId.js';

function readBearerToken(req: Request): string {
  const header = req.get('authorization');
  if (!header) throw new UnauthenticatedError();

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthenticatedError();

  return token;
}

/**
 * Default-deny gate. Every router mounts this before any handler; the only
 * unauthenticated routes in the system are `/healthz`, `/readyz` and the
 * session-opening endpoints under `/auth` (BUILD_PLAN §8.5).

 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readBearerToken(req);
    // Platform routes (`/auth/sessions`) name no event; they work in Event #1
    // like an alias path until P12 gives the person a scope of their own.
    const event = req.requestedEvent ?? { eventId: (await aliasEvent()).eventId, fromPath: false };
    req.auth = await authenticate(token, { event, requestId: requestIdOf(req) });
    next();
  } catch (error) {
    next(error);
  }
}

/** Narrowing helper for handlers that run after `requireAuth`. */
export function getAuth(req: Request): RequestAuth {
  if (!req.auth) {
    // Reaching here means a route was mounted without `requireAuth`, which is a
    // programming error rather than a client one.
    throw new UnauthenticatedError();
  }
  return req.auth;
}

/** The event a request works in, for use cases that take an `EventScope`. */
export function scopeOf(req: Request): EventScope {
  return { eventId: getAuth(req).eventId };
}
