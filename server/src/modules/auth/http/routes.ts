import { Router } from 'express';
import { CreateSessionRequest } from '@spoh/shared';
import { z } from 'zod';
import { requireAuth } from '../../../platform/identity/index.js';
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

/** Session endpoints: sign-in, hosted sign-in, renewal, sign-out and devices. */
export const authRouter: Router = Router();

const SessionIdParams = z.object({ id: z.string().min(1).max(64) }).strict();

authRouter.post(
  '/session',
  signInRateLimit,
  validate({ body: CreateSessionRequest }),
  createSessionHandler,
);
authRouter.get('/login', signInRateLimit, loginHandler);
authRouter.get('/callback', signInRateLimit, callbackHandler);
authRouter.post('/refresh', defaultRateLimit, refreshHandler);
authRouter.delete('/session', defaultRateLimit, signOutHandler);
authRouter.get('/sessions', requireAuth, defaultRateLimit, listSessionsHandler);
authRouter.delete(
  '/sessions/:id',
  requireAuth,
  defaultRateLimit,
  validate({ params: SessionIdParams }),
  revokeSessionHandler,
);
