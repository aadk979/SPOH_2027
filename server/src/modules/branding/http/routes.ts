import { Router } from 'express';
import { z } from 'zod';
import { BrandingUpload, BrandingUploadRequest, BrandingVariant, EventSlug, Id, PublishBrandingRequest, SaveBrandingRequest } from '@spoh/shared';
import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { idempotent, type RedactedReplay } from '../../../platform/http/idempotency.js';
import { adminRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate, validatedBody } from '../../../platform/http/validate.js';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { replayBrandingUpload } from '../application/upload.js';
import { previewBrandingHandler, publishBrandingHandler, readBrandingHandler, saveBrandingHandler, uploadBrandingHandler } from './handlers.js';
import { publicAssetHandler, publicIdentityHandler, publicManifestHandler, publicThemeHandler } from './publicHandlers.js';

const empty = z.object({}).strict();
const uploadReplay: RedactedReplay = {
  store: (body) => ({ receiptId: z.object({ data: BrandingUpload }).parse(body).data.receiptId }),
  replay: (req, stored) => replayBrandingUpload({ receiptId: z.object({ receiptId: Id }).strict().parse(stored).receiptId, request: validatedBody<BrandingUploadRequest>(req), actor: actorContextFrom(req) }),
};
export const brandingRouter: Router = Router();
brandingRouter.use(requireAuth);
brandingRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
brandingRouter.get('/', defaultRateLimit, authorize('Settings.Read', theEvent), validate({ query: empty }), readBrandingHandler);
brandingRouter.get('/draft/assets/:variant', defaultRateLimit, authorize('Settings.Read', theEvent), validate({ params: z.object({ variant: BrandingVariant }).strict(), query: empty }), previewBrandingHandler);
brandingRouter.put('/draft', adminRateLimit, authorize('Content.Edit', theEvent), validate({ body: SaveBrandingRequest }), idempotent('PUT /branding/draft'), saveBrandingHandler);
brandingRouter.post('/publish', adminRateLimit, authorize('Content.Publish', theEvent), validate({ body: PublishBrandingRequest }), idempotent('POST /branding/publish'), publishBrandingHandler);
brandingRouter.post('/images/upload', adminRateLimit, authorize('Content.Edit', theEvent), validate({ body: BrandingUploadRequest }), idempotent('POST /branding/images/upload', { redacted: uploadReplay }), uploadBrandingHandler);

export const publicBrandingRouter: Router = Router({ mergeParams: true });
const slugParams = z.object({ slug: EventSlug }).strict();
publicBrandingRouter.get('/', defaultRateLimit, validate({ params: slugParams, query: empty }), publicIdentityHandler);
publicBrandingRouter.get('/theme.css', defaultRateLimit, validate({ params: slugParams, query: z.object({ v: Id.optional() }).strict() }), publicThemeHandler);
publicBrandingRouter.get('/manifest.webmanifest', defaultRateLimit, validate({ params: slugParams, query: empty }), publicManifestHandler);
publicBrandingRouter.get('/assets/:publicationId/:variant', defaultRateLimit, validate({ params: slugParams.extend({ publicationId: Id, variant: BrandingVariant }).strict(), query: empty }), publicAssetHandler);
