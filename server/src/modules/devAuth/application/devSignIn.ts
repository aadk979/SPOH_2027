import type { CommitteeRole } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import { localAuthIssuer } from '../../../platform/identity/index.js';
import { findVolunteerByEmail } from '../data/repo.js';

/** A local dev token for a roster email, optionally under another role. */
export async function devSignIn(request: { email: string; role?: CommitteeRole }) {
  if (env.NODE_ENV === 'production' || !localAuthIssuer) throw new ForbiddenError();

  const volunteer = await findVolunteerByEmail(request.email.toLowerCase());
  if (!volunteer) throw new NotFoundError('Volunteer');

  const accessToken = await localAuthIssuer.issue({
    sub: volunteer.cognitoSub,
    groups: [request.role ?? volunteer.role],
  });

  return {
    accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: 12 * 60 * 60,
    volunteer: { displayName: volunteer.displayName, role: volunteer.role },
  };
}
