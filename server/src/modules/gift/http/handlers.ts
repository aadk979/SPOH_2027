import type { Request, Response } from 'express';
import type {
  AdjustGiftStockRequest,
  CreateGiftTypeRequest,
  GiftSummaryQuery,
  RedeemGiftRequest,
  UpdateGiftTypeRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { captureContextFrom } from '../../../platform/http/captureActor.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { adjustStock } from '../application/adjustStock.js';
import { createGiftType } from '../application/createGiftType.js';
import { updateGiftType } from '../application/updateGiftType.js';
import { listGifts } from '../application/listGifts.js';
import { redeemGift } from '../application/redeemGift.js';
import { summariseGifts } from '../application/summariseGifts.js';

export async function listGiftsHandler(req: Request, res: Response): Promise<void> {
  const gifts = await listGifts(scopeOf(req));
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
    ...actorContextFrom(req),
    membershipId: getAuth(req).membershipId,
  });
  res.status(200).json({ giftType });
}

export async function summariseGiftsHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await summariseGifts(scopeOf(req), validatedQuery<GiftSummaryQuery>(req)));
}

export async function createGiftTypeHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateGiftTypeRequest>(req);
  res.status(201).json({ giftType: await createGiftType(body, actorContextFrom(req)) });
}

export async function updateGiftTypeHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateGiftTypeRequest>(req);
  res.status(200).json({ giftType: await updateGiftType(id, patch, actorContextFrom(req)) });
}
