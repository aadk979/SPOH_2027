import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CommitteeRole } from '@spoh/shared';
import { env } from '../../config/env.js';
import { ForbiddenError, NotFoundError } from '../../platform/errors/index.js';
import { prisma } from '../../platform/db/client.js';
import { sensitiveRateLimit } from '../../platform/http/rateLimit.js';
import { localAuthIssuer } from '../../platform/identity/index.js';
import { validate, validatedBody } from '../../platform/http/validate.js';

/**
 * Development sign-in.
 *
 * Exchanges a roster email for a local dev token so the whole system is usable
 * before the Cognito User Pool exists. Mounted ONLY when AUTH_PROVIDER=local,
 * which `config/env.ts` already forbids in production — and the handler checks
 * again anyway, because a route that mints credentials should not rely on a
 * single guard someone might move.
 */
export function createDevAuthRouter(): Router {
  const router: Router = Router();

  if (env.AUTH_PROVIDER !== 'local' || env.NODE_ENV === 'production' || !localAuthIssuer) {
    return router;
  }

  const provider = localAuthIssuer;

  const SignInRequest = z
    .object({
      email: z.email(),
      /** Optional override, for exercising the capability matrix by hand. */
      role: CommitteeRole.optional(),
    })
    .strict();

  router.post(
    '/sign-in',
    sensitiveRateLimit,
    validate({ body: SignInRequest }),
    async (req: Request, res: Response) => {
      if (env.NODE_ENV === 'production') throw new ForbiddenError();

      const { email, role } = validatedBody<z.infer<typeof SignInRequest>>(req);

      const volunteer = await prisma.volunteer.findUnique({
        where: { email: email.toLowerCase() },
        select: { cognitoSub: true, role: true, displayName: true, active: true },
      });

      if (!volunteer) throw new NotFoundError('Volunteer');

      const accessToken = await provider.issue({
        sub: volunteer.cognitoSub,
        groups: [role ?? volunteer.role],
      });

      res.status(200).json({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 12 * 60 * 60,
        volunteer: { displayName: volunteer.displayName, role: volunteer.role },
      });
    },
  );

  return router;
}
