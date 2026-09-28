import { Router } from 'express';
import { z } from 'zod';
import { CommitteeRole } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { localAuthIssuer } from '../../../platform/identity/index.js';
import { validate } from '../../../platform/http/validate.js';
import { devSignInHandler } from './handlers.js';

/**
 * Development sign-in.
 *
 * Exchanges a roster email for a local dev token so the whole system is usable
 * before the Cognito User Pool exists. Mounted ONLY when AUTH_PROVIDER=local,
 * which `config/env.ts` already forbids in production — and the use case checks
 * again anyway, because a route that mints credentials should not rely on a
 * single guard someone might move.
 */
export function createDevAuthRouter(): Router {
  const router: Router = Router();

  if (env.AUTH_PROVIDER !== 'local' || env.NODE_ENV === 'production' || !localAuthIssuer) {
    return router;
  }

  const SignInRequest = z
    .object({
      email: z.email(),
      /** Optional override, for exercising the capability matrix by hand. */
      role: CommitteeRole.optional(),
    })
    .strict();

  router.post('/sign-in', sensitiveRateLimit, validate({ body: SignInRequest }), devSignInHandler);

  return router;
}
