import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AdjustGiftStockRequest, GiftSummaryQuery, Id, RedeemGiftRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { idempotent } from '../../middleware/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability, requireStationScope } from '../../middleware/rbac.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../middleware/validate.js';
import { captureActorFrom } from '../../lib/captureActor.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import { adjustStock, listGifts, redeemGift, summariseGifts } from './service.js';

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
  requireCapability('gift.redeem'),
  async (_req: Request, res: Response) => {
    const gifts = await listGifts();
    res.status(200).json({ data: gifts, meta: { count: gifts.length } });
  },
);

giftRouter.post(
  '/redemptions',
  captureRateLimit,
  requireCapability('gift.redeem'),
  validate({ body: RedeemGiftRequest }),
  requireStationScope(),
  idempotent('POST /gifts/redemptions'),
  async (req: Request, res: Response) => {
    const body = validatedBody<RedeemGiftRequest>(req);
    const result = await redeemGift(body, captureActorFrom(req), auditContextFrom(req));
    res.status(201).json(result);
  },
);

giftRouter.post(
  '/:id/adjust',
  defaultRateLimit,
  requireCapability('count.adjust'),
  validate({ params: IdParams, body: AdjustGiftStockRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<AdjustGiftStockRequest>(req);
    const giftType = await adjustStock(id, body, auth.volunteerId, auditContextFrom(req));
    res.status(200).json({ giftType });
  },
);

giftRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: GiftSummaryQuery }),
  async (req: Request, res: Response) => {
    res.status(200).json(await summariseGifts(validatedQuery<GiftSummaryQuery>(req)));
  },
);
