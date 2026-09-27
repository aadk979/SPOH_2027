import type { Request, Response } from 'express';
import type { AdjustGiftStockRequest, GiftSummaryQuery, RedeemGiftRequest } from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { captureContextFrom } from '../../../platform/http/captureActor.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import { adjustStock } from '../application/adjustStock.js';
import { listGifts } from '../application/listGifts.js';
import { redeemGift } from '../application/redeemGift.js';
import { summariseGifts } from '../application/summariseGifts.js';

export async function listGiftsHandler(_req: Request, res: Response): Promise<void> {
  const gifts = await listGifts();
  res.status(200).json({ data: gifts, meta: { count: gifts.length } });
}

export async function redeemGiftHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<RedeemGiftRequest>(req);
  res.status(201).json(await redeemGift(body, captureContextFrom(req)));
}

export async function adjustStockHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const body = validatedBody<AdjustGiftStockRequest>(req);
  const giftType = await adjustStock(id, body, {
    volunteerId: getAuth(req).volunteerId,
    audit: auditContextFrom(req),
  });
  res.status(200).json({ giftType });
}

export async function summariseGiftsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await summariseGifts(validatedQuery<GiftSummaryQuery>(req)));
}
