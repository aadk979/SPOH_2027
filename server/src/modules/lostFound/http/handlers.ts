import type { Request, Response } from 'express';
import type {
  ClaimLostFoundRequest,
  CreateLostFoundRequest,
  ListLostFoundQuery,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { claimItem } from '../application/claimItem.js';
import { listItems } from '../application/listItems.js';
import { logItem } from '../application/logItem.js';
import { markUnclaimedAtClose } from '../application/markUnclaimedAtClose.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';

export async function logItemHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateLostFoundRequest>(req);
  res.status(201).json({ item: await logItem(body, actorContextFrom(req)) });
}

export async function listItemsHandler(req: Request, res: Response): Promise<void> {
  const page = await listItems(scopeOf(req), validatedQuery<ListLostFoundQuery>(req));
  res.status(200).json({
    data: page.data,
    meta: { count: page.data.length, nextCursor: page.nextCursor },
  });
}

export async function claimItemHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const body = validatedBody<ClaimLostFoundRequest>(req);
  res.status(200).json({ item: await claimItem(id, body, actorContextFrom(req)) });
}

export async function closeOutHandler(req: Request, res: Response): Promise<void> {
  const count = await markUnclaimedAtClose(actorContextFrom(req));
  res.status(200).json({ markedUnclaimed: count });
}
