import type { CreateSessionRequest } from '@spoh/shared';
import type { AuditContext } from '../../../platform/audit/index.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { authProvider, localAuthIssuer } from '../../../platform/identity/index.js';
import { findVolunteerByEmail } from '../data/repo.js';
import type { OpenedSession, SessionContext } from './issueSession.js';
import { openSession } from './openSession.js';
import { verifiedAuthenticationAt } from '../domain/credentialRules.js';

/** `POST /auth/session`: verify the credential, then open a session for its subject. */
export async function signIn(
  body: CreateSessionRequest,
  context: SessionContext,
  audit: AuditContext,
): Promise<OpenedSession> {
  const verified = await subjectOf(body);
  return openSession(
    verified.sub,
    {
      ...context,
      ...(body.providerAccessToken ? { providerAccessToken: body.providerAccessToken } : {}),
      authenticatedAt: verifiedAuthenticationAt(verified.authTime),
    },
    audit,
  );
}

async function subjectOf(body: CreateSessionRequest) {
  if (body.providerAccessToken) {
    return authProvider.verify(body.providerAccessToken);
  }

  // Development sign-in. `localAuthIssuer` is null under Cognito, which is
  // what makes this path unreachable in every deployed environment.
  if (!localAuthIssuer) {
    throw new ValidationError(
      'This server authenticates against Cognito. Send providerAccessToken.',
    );
  }

  const volunteer = await findVolunteerByEmail(body.email as string);
  if (!volunteer) throw new NotFoundError('Volunteer');

  // Round-trips a real provider token so the dev path exercises the same
  // verification the deployed one does, rather than skipping it.
  const providerToken = await localAuthIssuer.issue({
    sub: volunteer.cognitoSub,
    groups: [body.role ?? volunteer.role],
  });
  return localAuthIssuer.verify(providerToken);
}
