import { Router } from 'express';
import { CreateSessionRequest, RedeemHandoffRequest, VerifyMfaRequest } from '@spoh/shared';
import { z } from 'zod';
import { requirePerson } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit, signInRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  callbackHandler,
  createSessionHandler,
  listSessionsHandler,
  loginHandler,
  refreshHandler,
  revokeSessionHandler,
  signOutHandler,
} from './handlers.js';
import {
  recoverHandler,
  handoffHandler,
  mfaSetupHandler,
  mfaVerifyHandler,
} from './securityHandlers.js';

/** Session endpoints: sign-in, hosted sign-in, renewal, sign-out and devices. */
export const authRouter: Router = Router();
authRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

const SessionIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

authRouter.post(
  '/session',
  signInRateLimit,
  validate({ body: CreateSessionRequest }),
  createSessionHandler,
);
authRouter.get('/login', signInRateLimit, loginHandler);
authRouter.get('/callback', signInRateLimit, callbackHandler);
authRouter.get('/recover', defaultRateLimit, recoverHandler);
authRouter.post(
  '/handoff',
  defaultRateLimit,
  validate({ body: RedeemHandoffRequest }),
  handoffHandler,
);
authRouter.post('/mfa/setup', signInRateLimit, mfaSetupHandler);
authRouter.post(
  '/mfa/verify',
  signInRateLimit,
  validate({ body: VerifyMfaRequest }),
  mfaVerifyHandler,
);
authRouter.post('/refresh', defaultRateLimit, refreshHandler);
authRouter.delete('/session', defaultRateLimit, signOutHandler);
authRouter.get(
  '/sessions',
  requirePerson,
  defaultRateLimit,
  listSessionsHandler,
);
authRouter.delete(
  '/sessions/:id',
  requirePerson,
  defaultRateLimit,
  validate({ params: SessionIdParams }),
  revokeSessionHandler,
);
