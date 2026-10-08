import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  self,
  fromParam,
  stationFromBody,
  anyStation,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import { AdjustGiftStockRequest, GiftSummaryQuery, Id, RedeemGiftRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability, requireStationScope } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import {
  adjustStockHandler,
  listGiftsHandler,
  redeemGiftHandler,
  summariseGiftsHandler,
} from './handlers.js';

/** Gift redemption and inventory (BUILD_PLAN §7.2). */
export const giftRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

giftRouter.use(requireAuth);

/**
 * Stock levels. Readable by anyone who can redeem, because the redemption
 * screen has to show an out-of-stock state rather than failing at the tap.
 */
giftRouter.get(
  '/',
  defaultRateLimit,
  authorize('Self.Read', self),
  requireCapability('gift.redeem'),
  listGiftsHandler,
);

giftRouter.post(
  '/redemptions',
  captureRateLimit,
  authorize('Gift.Redeem', stationFromBody),
  requireCapability('gift.redeem'),
  validate({ body: RedeemGiftRequest }),
  requireStationScope(),
  idempotent('POST /gifts/redemptions'),
  redeemGiftHandler,
);

giftRouter.post(
  '/:id/adjust',
  defaultRateLimit,
  authorize('Count.Adjust', fromParam('GiftType')),
  requireCapability('count.adjust'),
  validate({ params: IdParams, body: AdjustGiftStockRequest }),
  adjustStockHandler,
);

giftRouter.get(
  '/summary',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
  requireCapability('dashboard.station.read'),
  validate({ query: GiftSummaryQuery }),
  summariseGiftsHandler,
);
