import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CommitteeRole } from '@spoh/shared';
import { UnauthenticatedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { AuthProvider, VerifiedToken } from './types.js';

/**
 * AWS Cognito access-token verification (BUILD_PLAN §6.2).
 *
 * The verifier is constructed once at module load, never per request: it caches
 * the pool's JWKS, and rebuilding it on each call would put a network fetch in
 * front of every booth tap.
 */
export function createCognitoAuthProvider(config: {
  userPoolId: string;
  clientId: string;
}): AuthProvider {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    clientId: config.clientId,
    // Access tokens, not ID tokens: the ID token is for the client's own use
    // and carries profile claims the API has no business trusting.
    tokenUse: 'access',
  });

  // Warm the JWKS cache at boot so the first authenticated request of the
  // morning does not pay for the fetch.
  void verifier.hydrate().catch((error: unknown) => {
    logger.warn({ err: error }, 'Cognito JWKS pre-fetch failed; will retry on first request');
  });

  return {
    name: 'cognito',

    async verify(token: string): Promise<VerifiedToken> {
      try {
        const payload = await verifier.verify(token);
        return {
          sub: payload.sub,
          groups: extractGroups(payload['cognito:groups']),
        };
      } catch (error) {
        // The detail is genuinely useful for debugging a misconfigured pool,
        // and genuinely dangerous in a response body. Log it, return generic.
        logger.debug({ err: error }, 'Cognito token verification failed');
        throw new UnauthenticatedError();
      }
    },
  };
}

/**
 * Cognito group names are PascalCase (BUILD_PLAN §3.1); `CommitteeRole` values
 * are SCREAMING_SNAKE (§13). This is the only place the two vocabularies meet.
 */
const COGNITO_GROUP_TO_ROLE: Readonly<Record<string, CommitteeRole>> = Object.freeze({
  Admin: 'ADMIN',
  Lead: 'LEAD',
  ChiefCoordinator: 'CHIEF_COORDINATOR',
  DeputyCoordinator: 'DEPUTY_COORDINATOR',
  IC: 'IC',
  Volunteer: 'VOLUNTEER',
});

/**
 * `cognito:groups` is an untyped claim. Unknown group names are dropped rather
 * than rejected, so adding an unrelated Cognito group cannot lock anyone out.
 */
function extractGroups(claim: unknown): CommitteeRole[] {
  if (!Array.isArray(claim)) return [];

  const roles = claim
    .filter((value): value is string => typeof value === 'string')
    .map((name) => COGNITO_GROUP_TO_ROLE[name])
    .filter((role): role is CommitteeRole => role !== undefined);

  return [...new Set(roles)];
}
