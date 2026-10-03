import type { Request, Response } from 'express';
import type {
  CreateAnnouncementDraftRequest,
  PaginationQuery,
  UpdateAnnouncementDraftRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { createDraft } from '../application/createDraft.js';
import { updateDraft } from '../application/updateDraft.js';
import { listOwnDrafts, readOwnDraft } from '../application/readDrafts.js';

export async function createDraftHandler(req: Request, res: Response) {
  const draft = await createDraft(
    validatedBody<CreateAnnouncementDraftRequest>(req),
    actorContextFrom(req),
  );
  res.status(201).json({ draft });
}

export async function updateDraftHandler(req: Request, res: Response) {
  const { id } = validatedParams<{ id: string }>(req);
  const draft = await updateDraft(
    { id, request: validatedBody<UpdateAnnouncementDraftRequest>(req) },
    actorContextFrom(req),
  );
  res.status(200).json({ draft });
}

export async function readDraftHandler(req: Request, res: Response) {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ draft: await readOwnDraft(id, actorContextFrom(req)) });
}

export async function listDraftsHandler(req: Request, res: Response) {
  res
    .status(200)
    .json(await listOwnDrafts(validatedQuery<PaginationQuery>(req), actorContextFrom(req)));
}
