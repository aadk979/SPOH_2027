import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type Capability, roleHasCapability, roleMeets, type CommitteeRole } from '@spoh/shared';
import { isRosteredAt } from '../access/index.js';
import { ForbiddenError, StationScopeError, ValidationError } from '../errors/index.js';
import { named } from './named.js';
import { getAuth } from './requireAuth.js';

/** Authorization middleware: layer 1 (capability) and layer 2 (station scope), see platform/access. */

/** Layer 1. The primary authorization middleware. */
export function requireCapability(capability: Capability): RequestHandler {
  return named(
    `requireCapability(${capability})`,
    (req: Request, _res: Response, next: NextFunction): void => {
      const auth = getAuth(req);

      if (!roleHasCapability(auth.role, capability)) {
        next(
          new ForbiddenError('You do not have permission to perform this action', {
            required: capability,
          }),
        );
        return;
      }

      next();
    },
  );
}

/**
 * Rank comparison, for the few places where seniority rather than a named
 * capability is the right test — for example "may view a record raised by
 * someone more senior". Never use this in place of `requireCapability`.
 */
export function requireMinimumRole(minimum: CommitteeRole): RequestHandler {
  return named(
    `requireMinimumRole(${minimum})`,
    (req: Request, _res: Response, next: NextFunction): void => {
      const auth = getAuth(req);
      if (!roleMeets(auth.role, minimum)) {
        next(new ForbiddenError('You do not have permission to perform this action'));
        return;
      }
      next();
    },
  );
}

/** Pulls the target station id out of a validated request. */
export type StationIdExtractor = (req: Request) => string | undefined;

/** Default: capture endpoints carry `stationId` in the body. */
export const stationIdFromBody: StationIdExtractor = (req) => {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>).stationId;
  return typeof value === 'string' ? value : undefined;
};

export const stationIdFromParams =
  (param = 'stationId'): StationIdExtractor =>
  (req) => {
    const value = req.params[param];
    return typeof value === 'string' ? value : undefined;
  };

/**
 * Layer 2. Asserts the caller is rostered on the target station for a shift
 * block that is running now, in Singapore time.
 *
 * Deliberately strict about time: outside event hours no block is active and
 * nobody is on shift, so a counter left open overnight cannot keep writing.
 */
export function requireStationScope(
  extract: StationIdExtractor = stationIdFromBody,
): RequestHandler {
  return named('requireStationScope', (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const auth = getAuth(req);
        const stationId = extract(req);

        if (!stationId) {
          next(new ValidationError('stationId is required for this action'));
          return;
        }

        // IC and above may write anywhere — they are the people who correct a
        // station that has gone wrong. The bypass is recorded so it is visible
        // in reconciliation rather than indistinguishable from a normal write.
        if (roleMeets(auth.role, 'IC')) {
          const onShift = await isRosteredAt(auth.volunteerId, stationId);
          if (!onShift) auth.stationScopeBypass = { stationId };
          next();
          return;
        }

        if (!(await isRosteredAt(auth.volunteerId, stationId))) {
          next(new StationScopeError());
          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    })();
  });
}
