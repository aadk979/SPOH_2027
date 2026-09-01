import { SignJWT, jwtVerify } from 'jose';
import { CommitteeRole } from '@spoh/shared';
import { UnauthenticatedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AuthProvider, VerifiedToken } from './types.js';

/**
 * Development-only authentication.
 *
 * The Cognito User Pool for this event does not exist yet, and waiting for it
 * would block every other phase. This provider mints and verifies HS256 tokens
 * carrying exactly the two claims the real one produces — subject and groups —
 * so RBAC, station scoping, idempotency and audit are exercised identically in
 * development, in CI and in production. Only token verification differs.
 *
 * It is a complete authentication bypass by construction, so:
 *   - `config/env.ts` refuses to boot with AUTH_PROVIDER=local in production
 *   - this module throws if it is somehow constructed there anyway
 *
 * Both guards exist because one of them is the one that will still be there
 * after a hurried config change in January.
 */

const ISSUER = 'spoh2027-local-dev';
const AUDIENCE = 'spoh2027-api';

export interface LocalTokenClaims {
  sub: string;
  groups: CommitteeRole[];
  /** Token lifetime in seconds. Defaults to a working day. */
  expiresInSeconds?: number;
}

export function createLocalAuthProvider(config: {
  secret: string;
  nodeEnv: string;
}): AuthProvider & { issue(claims: LocalTokenClaims): Promise<string> } {
  if (config.nodeEnv === 'production') {
    throw new Error(
      'createLocalAuthProvider must never be constructed in production — it is a development authentication bypass',
    );
  }

  const key = new TextEncoder().encode(config.secret);

  logger.warn(
    'AUTH_PROVIDER=local: tokens are signed with a shared development secret. Never use this outside development.',
  );

  return {
    name: 'local',

    async verify(token: string): Promise<VerifiedToken> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        });

        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          throw new Error('token has no subject');
        }

        return { sub: payload.sub, groups: extractGroups(payload.groups) };
      } catch (error) {
        logger.debug({ err: error }, 'local token verification failed');
        throw new UnauthenticatedError();
      }
    },

    /** Mint a token. Used by the dev sign-in route and by integration tests. */
    async issue(claims: LocalTokenClaims): Promise<string> {
      const lifetime = claims.expiresInSeconds ?? 12 * 60 * 60;
      return new SignJWT({ groups: claims.groups })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${lifetime}s`)
        .sign(key);
    },
  };
}

function extractGroups(claim: unknown): CommitteeRole[] {
  if (!Array.isArray(claim)) return [];
  const roles = claim.filter((v): v is CommitteeRole => CommitteeRole.safeParse(v).success);
  return [...new Set(roles)];
}
