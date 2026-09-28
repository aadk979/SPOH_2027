import type { Request, Response } from 'express';
import type { CreateUploadRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { validatedBody, validatedQuery } from '../../../platform/http/validate.js';
import { createUpload } from '../application/createUpload.js';
import { readUrl } from '../application/readUrl.js';
import { mediaEnabled } from '../application/s3.js';

export function mediaConfigHandler(_req: Request, res: Response): void {
  res.status(200).json({ enabled: mediaEnabled() });
}

export async function createUploadHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateUploadRequest>(req);
  res.status(201).json(await createUpload(body, actorContextFrom(req)));
}

export async function readUrlHandler(req: Request, res: Response): Promise<void> {
  const { key } = validatedQuery<{ key: string }>(req);
  res.status(200).json(await readUrl(key));
}
