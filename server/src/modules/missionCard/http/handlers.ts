import type { Request, Response } from 'express';
import type {
  CardLookupParams,
  CardQrParams,
  GenerateCardBatchRequest,
  IssueCardRequest,
  ReissueCardRequest,
  StampCardRequest,
  TimeRangeQuery,
  VoidCardRequest,
} from '@spoh/shared';
import { actorContextFrom, auditContextFrom } from '../../../platform/http/auditContext.js';
import { captureContextFrom } from '../../../platform/http/captureActor.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { generateBatch } from '../application/generateBatch.js';
import { getCard, getCardByQr } from '../application/getCard.js';
import { getFunnel } from '../application/getFunnel.js';
import { issueCard } from '../application/issueCard.js';
import { reissueCard } from '../application/reissueCard.js';
import { stampCard } from '../application/stampCard.js';
import { voidCard } from '../application/voidCard.js';

const shortCodeOf = (req: Request): string => validatedParams<CardLookupParams>(req).shortCode;

export async function generateBatchHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<GenerateCardBatchRequest>(req);
  res.status(201).json(await generateBatch(body, auditContextFrom(req)));
}

export async function funnelHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await getFunnel(scopeOf(req), validatedQuery<TimeRangeQuery>(req)));
}

export async function getCardHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ card: await getCard(scopeOf(req), shortCodeOf(req)) });
}

export async function getCardByQrHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json({ card: await getCardByQr(scopeOf(req), validatedParams<CardQrParams>(req).payload) });
}

export async function issueCardHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<IssueCardRequest>(req);
  const card = await issueCard(shortCodeOf(req), body, captureContextFrom(req));
  res.status(200).json({ card });
}

export async function stampCardHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<StampCardRequest>(req);
  const result = await stampCard(shortCodeOf(req), body, captureContextFrom(req));
  // 200 rather than 201 when nothing new was written: the station had already
  // stamped this card, and the response is a warning, not a creation.
  res.status(result.stampAdded ? 201 : 200).json(result);
}

export async function voidCardHandler(req: Request, res: Response): Promise<void> {
  const { reason } = validatedBody<VoidCardRequest>(req);
  res.status(200).json({ card: await voidCard(shortCodeOf(req), reason, actorContextFrom(req)) });
}

export async function reissueCardHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ReissueCardRequest>(req);
  res.status(201).json(await reissueCard(shortCodeOf(req), body, actorContextFrom(req)));
}
