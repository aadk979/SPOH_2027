import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { ERROR_CODES, type BrandingVariant } from '@spoh/shared';
import { env } from '../../../config/env.js';
import { AppError, NotFoundError } from '../../../platform/errors/index.js';
import { validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { publicBrandingForSlug, readPublicAsset, readPublicPublication } from '../application/readBranding.js';
import { brandingCss } from '../domain/theme.js';
import { brandingManifest, trustedOrigin } from '../domain/manifest.js';

function sendPublic(req: Request, res: Response, input: { body: string | Uint8Array; type: string; etag: string; immutable?: boolean }) {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', input.immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('ETag', input.etag);
  res.type(input.type);
  if (req.get('If-None-Match') === input.etag) { res.status(304).end(); return; }
  res.send(typeof input.body === 'string' ? input.body : Buffer.from(input.body));
}
const hash = (body: string) => `"${createHash('sha256').update(body).digest('hex')}"`;
export async function publicIdentityHandler(req: Request, res: Response) {
  const { slug } = validatedParams<{ slug: string }>(req);
  const found = await publicBrandingForSlug(slug);
  if (!found) throw new NotFoundError('Published branding');
  sendPublic(req, res, { body: JSON.stringify({ data: found.data }), type: 'application/json', etag: found.etag });
}
export async function publicThemeHandler(req: Request, res: Response) {
  const { slug } = validatedParams<{ slug: string }>(req);
  const { v } = validatedQuery<{ v?: string }>(req);
  const { publication } = await readPublicPublication({ slug, publicationId: v });
  const body = brandingCss(publication.accent);
  sendPublic(req, res, { body, type: 'text/css', etag: hash(body), immutable: !!v });
}
export async function publicManifestHandler(req: Request, res: Response) {
  const { slug } = validatedParams<{ slug: string }>(req);
  const found = await publicBrandingForSlug(slug);
  if (!found) throw new NotFoundError('Published branding');
  const api = trustedOrigin(env.APP_BASE_URL ?? '');
  const client = trustedOrigin(env.CLIENT_BASE_URL ?? env.APP_BASE_URL ?? '');
  if (!api || !client) throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, { message: 'The application origins are not configured.', expose: true });
  const body = JSON.stringify(brandingManifest(found.data, { api, client }));
  sendPublic(req, res, { body, type: 'application/manifest+json', etag: hash(body) });
}
export async function publicAssetHandler(req: Request, res: Response) {
  const input = validatedParams<{ slug: string; publicationId: string; variant: BrandingVariant }>(req);
  const asset = await readPublicAsset(input);
  sendPublic(req, res, { ...asset, type: 'image/png', immutable: true });
}
