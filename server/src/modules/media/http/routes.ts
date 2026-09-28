import { Router } from 'express';
import { z } from 'zod';
import { CreateUploadRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { defaultRateLimit, sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/access/index.js';
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

const MediaUrlQuery = z.object({ key: z.string().min(1).max(200) }).strict();

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
