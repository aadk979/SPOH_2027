import type { NextFunction, Request, Response } from 'express';
import { capabilitiesForRole, highestRole } from '@spoh/shared';
import { env } from '../../config/env.js';
import {
  AccountInactiveError,
  NotProvisionedError,
  UnauthenticatedError,
} from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { requestIdOf } from '../requestId.js';
import type { RequestAuth } from '../../types/express.js';
import { createCognitoAuthProvider } from './cognitoProvider.js';
import { createLocalAuthProvider } from './localProvider.js';
import type { AuthProvider } from './types.js';

export type { AuthProvider, VerifiedToken } from './types.js';

/**
 * The active provider, constructed once at boot from validated configuration.
 * Cognito in staging and production; the local development provider only where
 * `config/env.ts` has already established that we are not in production.
 *
 * Constructed exactly once: the local provider logs a warning on construction,
 * and the dev sign-in route reuses this instance through `localAuthIssuer`
 * rather than building a second one.
 */
const localProvider =
  env.AUTH_PROVIDER === 'local'
    ? // Non-null assertion is safe: env validation requires LOCAL_AUTH_SECRET
      // whenever AUTH_PROVIDER=local, and forbids that combination in production.
      createLocalAuthProvider({
        secret: env.LOCAL_AUTH_SECRET as string,
        nodeEnv: env.NODE_ENV,
      })
    : null;

export const authProvider: AuthProvider =
  localProvider ??
  createCognitoAuthProvider({
    userPoolId: env.COGNITO_USER_POOL_ID as string,
    clientId: env.COGNITO_CLIENT_ID as string,
  });

/**
 * Token issuer for the development sign-in route. `null` in every environment
 * that uses Cognito, which is what makes the dev route impossible to mount there.
 */
export const localAuthIssuer = localProvider;

logger.info({ authProvider: authProvider.name }, 'authentication provider selected');

/**
 * Volunteer lookup cache.
 *
 * The `sub -> Volunteer` mapping changes when someone is provisioned or
 * deactivated, which is rare, but it is read on literally every request. A
 * 60-second TTL keeps a booth tap from paying for a database round trip it does
 * not need, while bounding how long a deactivated account keeps working.
 */
const VOLUNTEER_CACHE_TTL_MS = 60_000;

interface CachedVolunteer {
  volunteerId: string;
  displayName: string;
  role: RequestAuth['role'];
  active: boolean;
  expiresAt: number;
}

const volunteerCache = new Map<string, CachedVolunteer>();

/** Drop a subject from the cache. Called when a volunteer is edited. */
export function invalidateVolunteerCache(sub?: string): void {
  if (sub === undefined) volunteerCache.clear();
  else volunteerCache.delete(sub);
}

async function resolveVolunteer(sub: string): Promise<CachedVolunteer> {
  const cached = volunteerCache.get(sub);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const volunteer = await prisma.volunteer.findUnique({
    where: { cognitoSub: sub },
    select: { id: true, displayName: true, role: true, active: true },
  });

  if (!volunteer) throw new NotProvisionedError();

  const entry: CachedVolunteer = {
    volunteerId: volunteer.id,
    displayName: volunteer.displayName,
    role: volunteer.role,
    active: volunteer.active,
    expiresAt: Date.now() + VOLUNTEER_CACHE_TTL_MS,
  };

  volunteerCache.set(sub, entry);
  return entry;
}

function readBearerToken(req: Request): string {
  const header = req.get('authorization');
  if (!header) throw new UnauthenticatedError();

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthenticatedError();

  return token;
}

/**
 * Default-deny gate. Every router mounts this before any handler; the only
 * unauthenticated routes in the system are `/healthz` and `/readyz`
 * (BUILD_PLAN §8.5).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readBearerToken(req);
    const verified = await authProvider.verify(token);

    const volunteer = await resolveVolunteer(verified.sub);
    if (!volunteer.active) throw new AccountInactiveError();

    /**
     * The role comes from the database row, not from the token's groups. The
     * groups are recorded for the audit trail and for detecting drift, but the
     * roster is authoritative: a group added in the Cognito console without a
     * matching roster change must not silently grant capabilities.
     */
    const role = volunteer.role;
    const tokenRole = highestRole(verified.groups);

    if (tokenRole !== undefined && tokenRole !== role) {
      logger.warn(
        { requestId: requestIdOf(req), sub: verified.sub, tokenRole, rosterRole: role },
        'identity provider groups disagree with the roster; roster wins',
      );
    }

    req.auth = {
      sub: verified.sub,
      groups: verified.groups,
      role,
      volunteerId: volunteer.volunteerId,
      displayName: volunteer.displayName,
      capabilities: capabilitiesForRole(role),
    };

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
