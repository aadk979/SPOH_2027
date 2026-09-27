import { Router } from 'express';
import { z } from 'zod';
import { AdjustGiftStockRequest, GiftSummaryQuery, Id, RedeemGiftRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { idempotent } from '../../../platform/idempotency/index.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability, requireStationScope } from '../../../platform/access/index.js';
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
giftRouter.get('/', defaultRateLimit, requireCapability('gift.redeem'), listGiftsHandler);

giftRouter.post(
  '/redemptions',
  captureRateLimit,
  requireCapability('gift.redeem'),
  validate({ body: RedeemGiftRequest }),
  requireStationScope(),
  idempotent('POST /gifts/redemptions'),
  redeemGiftHandler,
);

giftRouter.post(
  '/:id/adjust',
  defaultRateLimit,
  requireCapability('count.adjust'),
  validate({ params: IdParams, body: AdjustGiftStockRequest }),
  adjustStockHandler,
);

giftRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: GiftSummaryQuery }),
  summariseGiftsHandler,
);
