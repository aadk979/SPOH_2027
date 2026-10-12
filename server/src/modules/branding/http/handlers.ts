import type { Request, Response } from 'express';
import type { BrandingUploadRequest, BrandingVariant, PublishBrandingRequest, SaveBrandingRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { readBranding, readDraftAsset } from '../application/readBranding.js';
import { saveBrandingDraft } from '../application/saveDraft.js';
import { publishBranding } from '../application/publish.js';
import { issueBrandingUpload } from '../application/upload.js';

export async function readBrandingHandler(req: Request, res: Response) { res.json(await readBranding(scopeOf(req))); }
export async function saveBrandingHandler(req: Request, res: Response) { res.json(await saveBrandingDraft(validatedBody<SaveBrandingRequest>(req), actorContextFrom(req))); }
export async function publishBrandingHandler(req: Request, res: Response) { res.json(await publishBranding(validatedBody<PublishBrandingRequest>(req), actorContextFrom(req))); }
export async function uploadBrandingHandler(req: Request, res: Response) { res.status(201).json(await issueBrandingUpload(validatedBody<BrandingUploadRequest>(req), actorContextFrom(req))); }
export async function previewBrandingHandler(req: Request, res: Response) {
  const { variant } = validatedParams<{ variant: BrandingVariant }>(req);
  res.type('image/png').send(Buffer.from(await readDraftAsset(scopeOf(req), variant)));
}
