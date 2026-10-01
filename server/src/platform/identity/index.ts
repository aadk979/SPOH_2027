import { capabilitiesForRole, highestRole } from '@spoh/shared';
import { env } from '../../config/env.js';
import {
  AccountInactiveError,
  NotFoundError,
  NotProvisionedError,
  UnauthenticatedError,
} from '../errors/index.js';
import { logger } from '../logger/index.js';
import { prisma } from '../db/client.js';
import type { RequestAuth } from '../../types/express.js';
import { verifyAccessToken } from './sessionTokens.js';
import {
  isCacheBusDegraded,
  onCacheBusRecovered,
  subscribeCacheEvent,
} from '../events/cacheBus.js';
import { createCognitoAuthProvider } from './cognitoProvider.js';
import { createCognitoIdentityProvider } from './cognitoIdentityProvider.js';
import { createLocalIdentityProvider } from './localIdentityProvider.js';
import type { IdentityProvider } from './provisioning.js';
import { createLocalAuthProvider } from './localProvider.js';
import type { AuthProvider } from './types.js';

export type { AuthProvider, VerifiedToken } from './types.js';
export type { IdentityProvider } from './provisioning.js';
export {
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  newFamilyId,
} from './sessionTokens.js';

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

/**
 * Account provisioning, the other half of identity: authentication verifies a
 * subject, provisioning creates one. Same switch, same two implementations.
 */
export const identityProvider: IdentityProvider =
  env.AUTH_PROVIDER === 'cognito'
    ? createCognitoIdentityProvider(env.COGNITO_USER_POOL_ID as string)
    : createLocalIdentityProvider();

logger.info({ authProvider: authProvider.name }, 'authentication provider selected');

/**
 * Volunteer lookup cache.
 *
 * The `sub -> Volunteer` mapping changes when someone is provisioned or
 * deactivated, which is rare, but it is read on literally every request. A
 * A 60-second TTL avoids a database round trip on every booth tap. Bus
 * notifications evict changed memberships promptly; a periodic refresh backs
 * up missed notifications. While disconnected, lookups bypass this cache.
 */
const VOLUNTEER_CACHE_TTL_MS = 60_000;

/**
 * Session liveness cache.
 *
 * An access token is short-lived but not instantly revocable, and "sign this
 * device out" has to mean something sooner than the token's own expiry. So the
 * session row backing a token is checked and cached for up to 60 seconds.
 * Revocation notifications evict it promptly; a periodic refresh backs up
 * missed notifications. While disconnected, every request checks the database.
 */
const SESSION_CACHE_TTL_MS = 60_000;

interface CachedVolunteer {
  volunteerId: string;
  displayName: string;
  /** The event this entry was resolved in. */
  eventId: string;
  membershipId: string;
  role: RequestAuth['role'];
  active: boolean;
  expiresAt: number;
}

/** Keyed by subject and event: one person, one entry per event they work in. */
const volunteerCache = new Map<string, CachedVolunteer>();
const cacheKey = (sub: string, eventId: string) => `${sub}|${eventId}`;
const sessionCache = new Map<string, { live: boolean; sub: string | null; expiresAt: number }>();

/** Drop a subject from the cache. Called when a volunteer is edited. */
export function invalidateVolunteerCache(sub?: string): void {
  if (sub === undefined) {
    volunteerCache.clear();
    sessionCache.clear();
  } else {
    for (const key of volunteerCache.keys()) {
      if (key.startsWith(`${sub}|`)) volunteerCache.delete(key);
    }
  }
}

/** Drop one session from the liveness cache, so a revoke takes effect at once. */
export function invalidateSessionCache(sessionId?: string): void {
  if (sessionId === undefined) sessionCache.clear();
  else sessionCache.delete(sessionId);
}

subscribeCacheEvent('membership', () => invalidateVolunteerCache());
subscribeCacheEvent('event.state', () => invalidateVolunteerCache());
subscribeCacheEvent('session', () => invalidateSessionCache());
onCacheBusRecovered(() => invalidateVolunteerCache());

/**
 * The event a request works in, and whether its path named it (ADR-001 §4).
 * An alias path (the pre-P09.7 surface) works in Event #1 without naming it.
 */
export interface RequestedEvent {
  eventId: string;
  fromPath: boolean;
}

/**
 * The person behind a subject and their membership of the requested event:
 * the role and standing come from the membership (ADR-001 §1). A path that
 * names an event the caller has no membership of answers 404, exactly as an
 * event that does not exist, so a response never tells an outsider an event
 * exists. On an alias path the same absence means "not provisioned", as it
 * always has.
 */
async function resolveVolunteer(sub: string, event: RequestedEvent): Promise<CachedVolunteer> {
  const { eventId } = event;
  const cached = volunteerCache.get(cacheKey(sub, eventId));
  if (!isCacheBusDegraded() && cached && cached.expiresAt > Date.now()) return cached;

  const volunteer = await prisma.person.findUnique({
    where: { cognitoSub: sub },
    select: { id: true, displayName: true },
  });
  if (!volunteer) throw new NotProvisionedError();

  const membership = await prisma.eventMembership.findUnique({
    where: { eventId_personId: { eventId, personId: volunteer.id } },
    select: { id: true, role: true, status: true },
  });
  if (!membership) throw event.fromPath ? new NotFoundError('Event') : new NotProvisionedError();

  const entry: CachedVolunteer = {
    volunteerId: volunteer.id,
    displayName: volunteer.displayName,
    eventId,
    membershipId: membership.id,
    role: membership.role,
    active: membership.status === 'ACTIVE',
    expiresAt: Date.now() + VOLUNTEER_CACHE_TTL_MS,
  };

  volunteerCache.set(cacheKey(sub, eventId), entry);
  return entry;
}

/**
 * Is the refresh session behind this access token still live, and is it the
 * token subject's own? The subject check binds `sid` to `sub`: without it, a
 * token forged with a leaked signing key needs only the forger's own live
 * session id to act as anyone (F04-011).
 */
async function sessionIsLive(sessionId: string, sub: string): Promise<boolean> {
  const cached = sessionCache.get(sessionId);
  if (!isCacheBusDegraded() && cached && cached.expiresAt > Date.now()) {
    return cached.live && cached.sub === sub;
  }

  const session = await prisma.refreshSession.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true, expiresAt: true, volunteer: { select: { cognitoSub: true } } },
  });

  const live = session !== null && session.revokedAt === null && session.expiresAt > new Date();
  const owner = session?.volunteer.cognitoSub ?? null;

  sessionCache.set(sessionId, { live, sub: owner, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  return live && owner === sub;
}

/** The subject a bearer token proves, and how it proved it. */
interface Subject {
  sub: string;
  groups: RequestAuth['groups'];
  sessionId?: string;
}

/**
 * The subject behind a bearer token. Two token shapes are accepted, in order:
 *
 *  1. An access token this API issued, which is the normal path — short-lived,
 *     renewed from the refresh cookie, and revocable through its session row.
 *
 *  2. An identity-provider token, verified directly. This is what the
 *     integration suite uses and what a service-to-service caller would present;
 *     it skips the session layer, so it cannot be revoked before it expires.
 */
async function subjectOf(token: string): Promise<Subject> {
  const session = await verifyAccessToken(token);
  if (session) {
    if (!(await sessionIsLive(session.sid, session.sub))) {
      // Signed out on this device, revoked by an administrator, or not this subject's.
      throw new UnauthenticatedError();
    }
    return { sub: session.sub, groups: [], sessionId: session.sid };
  }
  const verified = await authProvider.verify(token);
  return { sub: verified.sub, groups: verified.groups };
}

/**
 * The person behind a bearer token, for platform routes that are about the
 * person rather than one event (`GET /events`, ADR-001 §4).
 */
export async function authenticatePerson(
  token: string,
): Promise<{ sub: string; personId: string }> {
  const { sub } = await subjectOf(token);
  const person = await prisma.person.findUnique({
    where: { cognitoSub: sub },
    select: { id: true },
  });
  if (!person) throw new NotProvisionedError();
  return { sub, personId: person.id };
}

/**
 * Who a bearer token belongs to, as a request in one event will see it. Only
 * the subject is taken from the token. Role, capabilities and station scope
 * are read from the membership, every time.
 */
export async function authenticate(
  token: string,
  request: { event: RequestedEvent; requestId?: string },
): Promise<RequestAuth> {
  const { sub, groups, sessionId } = await subjectOf(token);
  const volunteer = await resolveVolunteer(sub, request.event);
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
      { requestId: request.requestId, sub, tokenRole, rosterRole: role },
      'identity provider groups disagree with the roster; roster wins',
    );
  }

  return {
    sub,
    groups,
    role,
    volunteerId: volunteer.volunteerId,
    eventId: volunteer.eventId,
    membershipId: volunteer.membershipId,
    displayName: volunteer.displayName,
    capabilities: capabilitiesForRole(role),
    ...(sessionId ? { sessionId } : {}),
  };
}
