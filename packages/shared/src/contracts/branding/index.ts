import { z } from 'zod';
import { Id, IdempotencyKey } from '../common/index.js';
import { EventSlug } from '../event/index.js';
import { UploadContentType } from '../media/index.js';
import { BrandingAccent, BrandingAlt } from './frozen.js';
export * from './frozen.js';

export const BrandingVariant = z.enum(['logo', 'icon-192', 'icon-512', 'maskable-512']);
export type BrandingVariant = z.infer<typeof BrandingVariant>;
export const BrandingDraft = z.object({ accent: BrandingAccent, logoAlt: BrandingAlt.nullable(), uploadReceiptId: Id.nullable() }).strict()
  .refine((value) => !value.uploadReceiptId || value.logoAlt !== null, { message: 'Describe the uploaded logo' });
export type BrandingDraft = z.infer<typeof BrandingDraft>;
export const SaveBrandingRequest = z.object({ idempotencyKey: IdempotencyKey, expectedVersion: z.number().int().nonnegative(), body: BrandingDraft }).strict();
export type SaveBrandingRequest = z.infer<typeof SaveBrandingRequest>;
export const PublishBrandingRequest = z.object({ idempotencyKey: IdempotencyKey, expectedVersion: z.number().int().positive() }).strict();
export type PublishBrandingRequest = z.infer<typeof PublishBrandingRequest>;
export const BrandingUploadRequest = z.object({ idempotencyKey: IdempotencyKey, expectedVersion: z.number().int().nonnegative(), contentType: UploadContentType, contentLength: z.number().int().min(1).max(1024 * 1024) }).strict();
export type BrandingUploadRequest = z.infer<typeof BrandingUploadRequest>;
export const BrandingUpload = z.object({ receiptId: Id, url: z.url(), fields: z.record(z.string(), z.string()), expiresIn: z.literal(300), maxBytes: z.number().int().positive() }).strict();
export type BrandingUpload = z.infer<typeof BrandingUpload>;
const publicPath = z.string().regex(/^\/api\/v1\/public\/events\/[a-z0-9-]+\/branding\//);
export const PublicBranding = z.object({
  slug: EventSlug, name: z.string().min(1).max(160), accent: BrandingAccent,
  publicationId: Id, publicationVersion: z.number().int().positive(),
  logo: z.object({ path: publicPath, alt: BrandingAlt }).strict().nullable(),
  icons: z.array(z.object({ path: publicPath, size: z.enum(['192x192', '512x512']), purpose: z.enum(['any', 'maskable']) }).strict()).max(3),
  themePath: publicPath, manifestPath: publicPath,
}).strict();
export type PublicBranding = z.infer<typeof PublicBranding>;
export const BrandingState = z.object({ eventId: Id, version: z.number().int().nonnegative(), draft: BrandingDraft, published: PublicBranding.nullable(), registryRemaining: z.number().int().nonnegative() }).strict();
export type BrandingState = z.infer<typeof BrandingState>;
