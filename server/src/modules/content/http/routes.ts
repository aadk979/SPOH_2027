import { Router } from 'express';
import { z } from 'zod';
import {
  ContentVersionQuery,
  CreateContentImageRequest,
  Id,
  PublishContentRequest,
  ReviewContentRequest,
  SaveContentDraftRequest,
  ScheduleContentRequest,
} from '@spoh/shared';
import { authorize } from '../../../platform/http/authorize.js';
import { self, theEvent } from '../../../platform/http/authorizeResources.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import {
  contentHistoryHandler,
  immutableContentHandler,
  publishedContentHandler,
  publishContentHandler,
  readDraftHandler,
  reviewDraftHandler,
  saveDraftHandler,
  scheduleContentHandler,
  uploadContentImageHandler,
} from './handlers.js';
import { contentImageReplay } from './uploadReplay.js';

export const contentRouter: Router = Router();
contentRouter.use(requireAuth);
contentRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
contentRouter.get(
  '/',
  defaultRateLimit,
  authorize('Self.Read', self),
  validate({ query: ContentVersionQuery }),
  publishedContentHandler,
);
contentRouter.get(
  '/draft',
  defaultRateLimit,
  authorize('Settings.Read', theEvent),
  readDraftHandler,
);
contentRouter.get(
  '/versions',
  defaultRateLimit,
  authorize('Settings.Read', theEvent),
  contentHistoryHandler,
);
contentRouter.put(
  '/draft',
  adminRateLimit,
  authorize('Content.Edit', theEvent),
  validate({ body: SaveContentDraftRequest }),
  idempotent('PUT /content/draft'),
  saveDraftHandler,
);
contentRouter.post(
  '/review',
  adminRateLimit,
  authorize('Content.Publish', theEvent),
  validate({ body: ReviewContentRequest }),
  idempotent('POST /content/review'),
  reviewDraftHandler,
);
contentRouter.post(
  '/publish',
  adminRateLimit,
  authorize('Content.Publish', theEvent),
  validate({ body: PublishContentRequest }),
  idempotent('POST /content/publish'),
  publishContentHandler,
);
contentRouter.post(
  '/schedules',
  adminRateLimit,
  authorize('Schedule.Manage', theEvent),
  authorize('Content.Publish', theEvent),
  validate({ body: ScheduleContentRequest }),
  idempotent('POST /content/schedules'),
  scheduleContentHandler,
);
contentRouter.post(
  '/images/upload',
  adminRateLimit,
  authorize('Content.Edit', theEvent),
  validate({ body: CreateContentImageRequest }),
  idempotent('POST /content/images/upload', { redacted: contentImageReplay }),
  uploadContentImageHandler,
);

/** Only committed publications are served; draft S3 keys never become public object proxies. */
const resourceParams = z
  .object({
    versionId: Id,
    image: z
      .string()
      .regex(/^map-[0-9]+$/)
      .optional(),
  })
  .strict();
contentRouter.get(
  '/assets/:versionId/:image',
  defaultRateLimit,
  authorize('Self.Read', self),
  validate({ params: resourceParams }),
  immutableContentHandler,
);
