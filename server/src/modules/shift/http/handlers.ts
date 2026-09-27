import type { Request, Response } from 'express';
import type {
  CompleteBriefingSlotRequest,
  CreateSwapRequest,
  DecideSwapRequest,
  ListBriefingSlotsQuery,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getAuth } from '../../../platform/identity/index.js';
import { getBriefingSlots, markSlotComplete } from '../application/briefingSlots.js';
import { decideSwap } from '../application/decideSwap.js';
import { listMySwaps, listPendingSwaps } from '../application/listSwaps.js';
import { requestSwap } from '../application/requestSwap.js';
import { getStaffingGaps } from '../application/staffing.js';

const idOf = (req: Request): string => validatedParams<{ id: string }>(req).id;

function asList<T>(res: Response, data: T[]): void {
  res.status(200).json({ data, meta: { count: data.length, nextCursor: null } });
}

export async function requestSwapHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateSwapRequest>(req);
  res.status(201).json({ swap: await requestSwap(body, actorContextFrom(req)) });
}

export async function mySwapsHandler(req: Request, res: Response): Promise<void> {
  asList(res, await listMySwaps(getAuth(req).volunteerId));
}

export async function pendingSwapsHandler(_req: Request, res: Response): Promise<void> {
  asList(res, await listPendingSwaps());
}

export async function decideSwapHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<DecideSwapRequest>(req);
  res.status(200).json({ swap: await decideSwap(idOf(req), body, actorContextFrom(req)) });
}

export async function briefingSlotsHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListBriefingSlotsQuery>(req);
  asList(res, await getBriefingSlots(query, getAuth(req).volunteerId));
}

export async function completeSlotHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CompleteBriefingSlotRequest>(req);
  res.status(200).json({ slot: await markSlotComplete(idOf(req), body, actorContextFrom(req)) });
}

export async function staffingGapsHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await getStaffingGaps());
}
