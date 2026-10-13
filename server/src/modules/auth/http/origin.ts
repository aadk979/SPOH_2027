import type { Request } from 'express';
import { env } from '../../../config/env.js';
import { ForbiddenError } from '../../../platform/errors/index.js';

/**
 * Reject a state-changing auth request from an origin we do not serve.
 *
 * A cookie-bearing endpoint that mints credentials needs more than SameSite.
 * CORS does not stop a cross-site form POST, and while an attacker could not
 * read the response, they could force a rotation — which would make the
 * victim's next genuine refresh look like token reuse and revoke their whole
 * family. A denial of service dressed as a security feature.
 *
 * Two things prevent it: the JSON content type (a form POST cannot send one
 * without triggering a preflight the allowlist rejects), and this check on
 * every state-changing route. An absent Origin needs same-origin Fetch Metadata
 * and a non-safelisted JSON content type, rather than granting an unknown caller.
 */
export function assertTrustedOrigin(req: Request): void {
  const origin = req.get('origin');
  if (origin && env.CORS_ALLOWED_ORIGINS.includes(origin)) return;
  if (!origin && req.get('sec-fetch-site') === 'same-origin' &&
    req.is('application/json')) return;

  throw new ForbiddenError('This request did not come from a known origin');
}
