import type { Request, Response } from 'express';
import type {
  CreateFootfallBulkRequest,
  CreateFootfallTickRequest,
  FootfallSummaryQuery,
  VoidFootfallTickRequest,
} from '@spoh/shared';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { captureContextFrom } from '../../../platform/http/captureActor.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getLiveFootfall } from '../application/getLiveFootfall.js';
import { recordBulk } from '../application/recordBulk.js';
import { recordTick } from '../application/recordTick.js';
import { summariseFootfall } from '../application/summariseFootfall.js';
import { voidTickById } from '../application/voidTickById.js';

export async function recordTickHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateFootfallTickRequest>(req);
  res.status(201).json(await recordTick(body, captureContextFrom(req)));
}

export async function recordBulkHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateFootfallBulkRequest>(req);
  res.status(201).json(await recordBulk(body, captureContextFrom(req)));
}

export async function voidTickHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const { reason } = validatedBody<VoidFootfallTickRequest>(req);
  await voidTickById(id, reason, auditContextFrom(req));
  res.status(204).send();
}

export async function summariseFootfallHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<FootfallSummaryQuery>(req);
  res.status(200).json(await summariseFootfall(query));
}

export async function liveFootfallHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json(await getLiveFootfall());
}
