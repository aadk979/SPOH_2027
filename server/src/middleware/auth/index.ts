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
import { verifyAccessToken } from '../../modules/auth/tokens.js';
import { createCognitoAuthProvider } from './cognitoProvider.js';
import { createLocalAuthProvider } from './localProvider.js';
import type { AuthProvider } from './types.js';

export type { AuthProvider, VerifiedToken } from './types.js';

/**
 * The active identity provider, constructed once at boot from validated
 * configuration. Cognito in staging and production; the local development
 * provider only where `config/env.ts` has already established that we are not
 * in production.
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

/**
 * Session liveness cache.
 *
 * An access token is short-lived but not instantly revocable, and "sign this
 * device out" has to mean something sooner than the token's own expiry. So the
 * session row backing a token is checked — cached on the same 60-second budget,
 * which turns it into roughly one extra query per device per minute rather than
 * one per capture tap.
 */
const SESSION_CACHE_TTL_MS = 60_000;

interface CachedVolunteer {
  volunteerId: string;
  displayName: string;
  role: RequestAuth['role'];
  active: boolean;
  expiresAt: number;
}

const volunteerCache = new Map<string, CachedVolunteer>();
const sessionCache = new Map<string, { live: boolean; expiresAt: number }>();

/** Drop a subject from the cache. Called when a volunteer is edited. */
export function invalidateVolunteerCache(sub?: string): void {
  if (sub === undefined) {
    volunteerCache.clear();
    sessionCache.clear();
  } else {
    volunteerCache.delete(sub);
  }
}

/** Drop one session from the liveness cache, so a revoke takes effect at once. */
export function invalidateSessionCache(sessionId?: string): void {
  if (sessionId === undefined) sessionCache.clear();
  else sessionCache.delete(sessionId);
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

/** Is the refresh session behind this access token still live? */
async function sessionIsLive(sessionId: string): Promise<boolean> {
  const cached = sessionCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) return cached.live;

  const session = await prisma.refreshSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true },
  });

  const live = session !== null && session.revokedAt === null && session.expiresAt > new Date();

  sessionCache.set(sessionId, { live, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  return live;
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
 * unauthenticated routes in the system are `/healthz`, `/readyz` and the
 * session-opening endpoints under `/auth` (BUILD_PLAN §8.5).
 *
 * Two token shapes are accepted, in order:
 *
 *  1. An access token this API issued, which is the normal path — short-lived,
 *     renewed from the refresh cookie, and revocable through its session row.
 *
 *  2. An identity-provider token, verified directly. This is what the
 *     integration suite uses and what a service-to-service caller would present;
 *     it skips the session layer, so it cannot be revoked before it expires.
 *
 * Whichever arrives, only the subject is taken from it. Role, capabilities and
 * station scope are read from the roster, every time.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readBearerToken(req);

    const session = await verifyAccessToken(token);
    let sub: string;
    let groups: RequestAuth['groups'] = [];
    let sessionId: string | undefined;

    if (session) {
      if (!(await sessionIsLive(session.sid))) {
        // Signed out on this device, or revoked by an administrator.
        throw new UnauthenticatedError();
      }
      sub = session.sub;
      sessionId = session.sid;
    } else {
      const verified = await authProvider.verify(token);
      sub = verified.sub;
      groups = verified.groups;
    }

    const volunteer = await resolveVolunteer(sub);
    if (!volunteer.active) throw new AccountInactiveError();

    /**
     * The role comes from the database row, not from the token's groups. The
     * groups are recorded for the audit trail and for detecting drift, but the
     * roster is authoritative: a group added in the Cognito console without a
     * matching roster change must not silently grant capabilities.
     */
    const role = volunteer.role;
    const tokenRole = highestRole(groups);

    if (tokenRole !== undefined && tokenRole !== role) {
      logger.warn(
        { requestId: requestIdOf(req), sub, tokenRole, rosterRole: role },
        'identity provider groups disagree with the roster; roster wins',
      );
    }

    req.auth = {
      sub,
      groups,
      role,
      volunteerId: volunteer.volunteerId,
      displayName: volunteer.displayName,
      capabilities: capabilitiesForRole(role),
      ...(sessionId ? { sessionId } : {}),
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
