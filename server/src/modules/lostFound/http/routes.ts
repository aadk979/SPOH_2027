import { authorize } from '../../../platform/http/authorize.js';
import { theEvent, self, fromParam } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  ClaimLostFoundRequest,
  CreateLostFoundRequest,
  Id,
  ListLostFoundQuery,
} from '@spoh/shared';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
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
  authorize('LostFound.Log', theEvent),
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
  authorize('Self.Read', self),
  validate({ query: ListLostFoundQuery }),
  listItemsHandler,
);

lostFoundRouter.post(
  '/:id/claim',
  defaultRateLimit,
  authorize('LostFound.Claim', fromParam('LostFoundItem')),
  validate({ params: IdParams, body: ClaimLostFoundRequest }),
  claimItemHandler,
);

/** End-of-event close-out, so every case has an outcome in the report. */
lostFoundRouter.post(
  '/close-out',
  defaultRateLimit,
  authorize('LostFound.CloseOut', theEvent, { changes: ['C6'] }),
  closeOutHandler,
);
