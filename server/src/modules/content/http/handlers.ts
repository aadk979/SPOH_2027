import type { Request, Response } from 'express';
import type {
  ContentVersionQuery,
  CreateContentImageRequest,
  PublishContentRequest,
  ReviewContentRequest,
  SaveContentDraftRequest,
  ScheduleContentRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { createContentImageUpload } from '../application/createImageUpload.js';
import { publishContent } from '../application/publishContent.js';
import {
  readContentDraft,
  readContentHistory,
  readImmutableContent,
  readPublishedContent,
} from '../application/readContent.js';
import { reviewContentDraft } from '../application/reviewDraft.js';
import { saveContentDraft } from '../application/saveDraft.js';
import { scheduleContentPublication } from '../application/scheduleContent.js';

export async function readDraftHandler(req: Request, res: Response) {
  res.json(await readContentDraft(scopeOf(req)));
}
export async function saveDraftHandler(req: Request, res: Response) {
  res.json(
    await saveContentDraft(validatedBody<SaveContentDraftRequest>(req), actorContextFrom(req)),
  );
}
export async function reviewDraftHandler(req: Request, res: Response) {
  res.json(
    await reviewContentDraft(validatedBody<ReviewContentRequest>(req), actorContextFrom(req)),
  );
}
export async function publishContentHandler(req: Request, res: Response) {
  res.json(await publishContent(validatedBody<PublishContentRequest>(req), actorContextFrom(req)));
}
export async function scheduleContentHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await scheduleContentPublication(
        validatedBody<ScheduleContentRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function uploadContentImageHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createContentImageUpload(
        validatedBody<CreateContentImageRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function contentHistoryHandler(req: Request, res: Response) {
  res.json(await readContentHistory(scopeOf(req)));
}
export async function publishedContentHandler(req: Request, res: Response) {
  const query = validatedQuery<ContentVersionQuery>(req);
  const response = await readPublishedContent(scopeOf(req), query);
  res.setHeader('ETag', response.data.etag);
  res.setHeader('Cache-Control', query.v ? 'private, max-age=31536000, immutable' : 'no-store');
  if (req.get('If-None-Match') === response.data.etag) {
    res.status(304).end();
    return;
  }
  res.json(response);
}
export async function immutableContentHandler(req: Request, res: Response) {
  const input = validatedParams<{ versionId: string; image?: string }>(req);
  const resource = await readImmutableContent(scopeOf(req), input);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(resource.contentType);
  if (resource.etag) res.setHeader('ETag', resource.etag);
  if (resource.etag && req.get('If-None-Match') === resource.etag) {
    res.status(304).end();
    return;
  }
  res.send(Buffer.from(resource.body));
}
