import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env, isProduction } from '../../config/env.js';
import { UnauthenticatedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * The API's own access token.
 *
 * Previously the identity provider's token was passed straight through to every
 * request, which tied the session to Cognito's one-hour access-token lifetime
 * and left no way to renew it: the client held the token in memory (correctly —
 * a volunteer's phone is shared, borrowed and lost), so a hard refresh signed
 * them out and there was nothing to refresh from.
 *
 * Issuing our own token separates the two lifetimes. The provider is
 * authenticated against exactly once, when the session opens; after that the
 * API renews its own short-lived token from an httpOnly refresh cookie that
 * page script cannot read.
 *
 * The token stays deliberately thin. It carries the identity-provider subject
 * and the session id, and nothing else — no role, no capabilities, no station.
 * Those are still read from the roster on every request, so a role change or a
 * deactivation takes effect within the volunteer-cache TTL rather than lasting
 * as long as somebody's token does.
 */

const ISSUER = 'spoh2027-api';
const AUDIENCE = 'spoh2027-api';

/**
 * Signing key.
 *
 * Required in production, where an ephemeral key would sign every volunteer out
 * on each deploy and — worse — leave instances unable to verify each other's
 * tokens behind a load balancer. Outside production one is generated at boot so
 * a developer machine needs no extra configuration.
 */
const secret: Uint8Array = (() => {
  if (env.SESSION_SIGNING_SECRET) {
    return new TextEncoder().encode(env.SESSION_SIGNING_SECRET);
  }

  if (isProduction) {
    // env validation already refuses this combination; belt and braces, because
    // a silently ephemeral production key is a very quiet outage.
    throw new Error('SESSION_SIGNING_SECRET is required in production');
  }

  logger.warn(
    'SESSION_SIGNING_SECRET is unset: signing sessions with an ephemeral key. Restarting the server invalidates every session.',
  );
  return new Uint8Array(randomBytes(32));
})();

export interface SessionClaims {
  /** Identity-provider subject. The rest of the pipeline resolves the roster row from this. */
  sub: string;
  /** RefreshSession id, so a token can be tied back to the device that holds it. */
  sid: string;
}

/** Mint an access token. Lifetime comes from configuration, not from here. */
export async function issueAccessToken(claims: SessionClaims): Promise<{
  token: string;
  expiresIn: number;
}> {
  const expiresIn = env.ACCESS_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);

  return { token, expiresIn };
}

/**
 * Verify an access token this API issued.
 *
 * Returns `null` rather than throwing when the token is simply not one of ours,
 * so `requireAuth` can fall through to the identity provider. A token that IS
 * ours but is expired or tampered with is a genuine failure and throws.
 */
export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthenticatedError();
    }

    return { sub: payload.sub, sid: payload.sid };
  } catch {
    // Could be a Cognito token, a dev-provider token, or rubbish. The caller
    // decides; distinguishing them here would leak which verifier rejected it.
    return null;
  }
}

/**
 * A refresh token: 256 bits of opaque randomness.
 *
 * Not a JWT on purpose. It carries no claims, cannot be introspected, and is
 * only ever meaningful by lookup — so revoking one actually revokes it, which a
 * self-contained signed token cannot offer without a revocation list anyway.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the digest is stored, so the table is useless to anyone who reads it. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newFamilyId(): string {
  return randomUUID();
}
