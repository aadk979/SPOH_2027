import { Router } from 'express';
import { CreateUploadRequest, MediaUrlQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { createUploadHandler, mediaConfigHandler, readUrlHandler } from './handlers.js';

/**
 * Presigned media access.
 *
 * Issuing an upload policy is gated on `lostFound.log`, because that is the
 * only thing anyone uploads. Reading is wider — the desk searches lost and
 * found, and everyone who can see the list can see the photos on it.
 */
export const mediaRouter: Router = Router();

mediaRouter.use('/url', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
mediaRouter.use(requireAuth);

/** Lets the client hide the camera button rather than offer one that 503s. */
mediaRouter.get('/config', defaultRateLimit, requireCapability('own.read'), mediaConfigHandler);

/**
 * The sensitive limit: each call signs a credential, and a client looping here
 * would mint upload policies far faster than anybody photographs lost umbrellas.
 */
mediaRouter.post(
  '/uploads',
  sensitiveRateLimit,
  requireCapability('lostFound.log'),
  validate({ body: CreateUploadRequest }),
  createUploadHandler,
);

mediaRouter.get(
  '/url',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: MediaUrlQuery }),
  readUrlHandler,
);
