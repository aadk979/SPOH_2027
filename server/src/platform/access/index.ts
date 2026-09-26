import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type Capability, roleHasCapability, roleMeets, type CommitteeRole } from '@spoh/shared';
import { ForbiddenError, StationScopeError, ValidationError } from '../errors/index.js';
import { prisma } from '../db/client.js';
import { activeShiftBlocks, eventDayAnchor, singaporeDateString } from '../time/index.js';
import { getAuth } from '../identity/index.js';
import { named } from '../http/named.js';

/**
 * Authorization, in two layers (BUILD_PLAN §6.3).
 *
 * Layer 1 — capability. Which actions this role may perform at all, read from
 * the shared capability matrix. Note this is NOT role precedence: `Lead`
 * outranks `Volunteer` but must not be able to create a registration, so a
 * precedence comparison would grant exactly the wrong thing.
 *
 * Layer 2 — station scope. For capture writes, whether the caller is actually
 * rostered on the target station for a currently-running shift block. IC and
 * above bypass this, and the bypass is audited.
 */

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

/**
 * Is this volunteer rostered at this station, today, in a block that is
 * currently running? Checked against the database rather than the token because
 * station assignment changes hourly and group membership does not.
 */
async function isRosteredAt(volunteerId: string, stationId: string): Promise<boolean> {
  const blocks = activeShiftBlocks();
  if (blocks.length === 0) return false;

  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      volunteerId,
      stationId,
      block: { in: blocks },
      eventDay: { date: eventDayAnchor(singaporeDateString()) },
    },
    select: { id: true },
  });

  return assignment !== null;
}
