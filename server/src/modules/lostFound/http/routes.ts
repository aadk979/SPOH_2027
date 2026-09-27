import { Router } from 'express';
import { z } from 'zod';
import {
  ClaimLostFoundRequest,
  CreateLostFoundRequest,
  Id,
  ListLostFoundQuery,
} from '@spoh/shared';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/access/index.js';
import { requireAuth } from '../../../platform/identity/index.js';
import { validate } from '../../../platform/http/validate.js';
import { claimItemHandler, closeOutHandler, listItemsHandler, logItemHandler } from './handlers.js';

/** Lost and found (BUILD_PLAN §7.2). */
export const lostFoundRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

lostFoundRouter.use(requireAuth);

/** Any volunteer can log an item — whoever finds it is whoever is standing there. */
lostFoundRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('lostFound.log'),
  validate({ body: CreateLostFoundRequest }),
  logItemHandler,
);

/**
 * Searchable by everyone. A visitor asking about a lost bottle will ask
 * whichever volunteer they happen to be standing next to.
 */
lostFoundRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: ListLostFoundQuery }),
  listItemsHandler,
);

lostFoundRouter.post(
  '/:id/claim',
  defaultRateLimit,
  requireCapability('lostFound.log'),
  validate({ params: IdParams, body: ClaimLostFoundRequest }),
  claimItemHandler,
);

/** End-of-event close-out, so every case has an outcome in the report. */
lostFoundRouter.post(
  '/close-out',
  defaultRateLimit,
  requireCapability('report.generate'),
  closeOutHandler,
);
