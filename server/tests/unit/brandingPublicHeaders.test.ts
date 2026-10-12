import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { beforeEach, expect, it, vi } from 'vitest';
import { BrandingVariant, EventSlug, Id, type PublicBranding } from '@spoh/shared';
const reads = vi.hoisted(() => ({ identity: vi.fn(), publication: vi.fn(), asset: vi.fn() }));
const config = vi.hoisted(() => ({ APP_BASE_URL: '', CLIENT_BASE_URL: undefined as string | undefined }));
vi.mock('../../src/config/env.js', () => ({ env: config }));
vi.mock('../../src/modules/branding/application/readBranding.js', () => ({
  publicBrandingForSlug: reads.identity, readPublicPublication: reads.publication, readPublicAsset: reads.asset,
}));
import { validate } from '../../src/platform/http/validate.js';
import { AppError } from '../../src/platform/errors/index.js';
import { publicAssetHandler, publicIdentityHandler, publicManifestHandler, publicThemeHandler } from '../../src/modules/branding/http/publicHandlers.js';

const brand: PublicBranding = {
  slug: 'approved-event', name: 'Approved event with a long display name', accent: '#8844aa',
  publicationId: 'publication', publicationVersion: 1, logo: null,
  icons: [{ path: '/api/v1/public/events/approved-event/branding/assets/publication/icon-192', size: '192x192', purpose: 'any' }],
  themePath: '/api/v1/public/events/approved-event/branding/theme.css?v=publication',
  manifestPath: '/api/v1/public/events/approved-event/branding/manifest.webmanifest',
};
const app = express();
const params = z.object({ slug: EventSlug }).strict();
app.get('/:slug/identity', validate({ params }), publicIdentityHandler);
app.get('/:slug/manifest', validate({ params }), publicManifestHandler);
app.get('/:slug/theme', validate({ params, query: z.object({ v: Id.optional() }).strict() }), publicThemeHandler);
app.get('/:slug/assets/:publicationId/:variant', validate({ params: params.extend({ publicationId: Id, variant: BrandingVariant }) }), publicAssetHandler);
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error instanceof AppError ? error.statusCode : 500;
  res.status(status).json({ error: error instanceof AppError ? error.code : 'INTERNAL_ERROR' });
});
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(config, { APP_BASE_URL: '', CLIENT_BASE_URL: undefined });
  reads.identity.mockResolvedValue({ data: brand, etag: '"approved-identity"' });
  reads.publication.mockResolvedValue({ publication: { accent: brand.accent } });
  reads.asset.mockResolvedValue({ body: Uint8Array.from([137, 80, 78, 71]), etag: '"approved-raster"' });
});

it('answers public identity and conditional reads with safe MIME, exact ETag and deliberate caching', async () => {
  const identity = await request(app).get('/approved-event/identity');
  expect(identity.status).toBe(200);
  expect(identity.body).toEqual({ data: brand });
  expect(identity.headers).toMatchObject({
    etag: '"approved-identity"', 'cache-control': 'no-cache',
    'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff',
  });
  expect(identity.headers['content-type']).toContain('application/json');
  const fresh = await request(app).get('/approved-event/identity').set('If-None-Match', '"approved-identity"');
  expect(fresh.status).toBe(304);
  expect(fresh.text).toBe('');
  reads.identity.mockResolvedValue(null);
  expect((await request(app).get('/approved-event/identity')).status).toBe(404);
  expect((await request(app).get('/approved-event/manifest')).status).toBe(404);
});

it.each([
  ['', undefined], ['https://api.example.test', 'https://client.example.test/path'],
  ['https://api.example.test/path', 'https://client.example.test'],
])('refuses manifest navigation without exact trusted API/client origins', async (api, client) => {
  Object.assign(config, { APP_BASE_URL: api, CLIENT_BASE_URL: client });
  const response = await request(app).get('/approved-event/manifest').set('Host', 'attacker.example.test');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'SERVICE_UNAVAILABLE' });
  expect(response.text).not.toContain('attacker');
});

it('pins navigation and raster URLs to configured origins, never request Host or Origin', async () => {
  Object.assign(config, { APP_BASE_URL: 'https://api.example.test', CLIENT_BASE_URL: 'https://client.example.test' });
  const response = await request(app).get('/approved-event/manifest')
    .set('Host', 'attacker.example.test').set('Origin', 'https://attacker.example.test');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('application/manifest+json');
  const body = JSON.parse(response.text);
  expect(body).toMatchObject({ name: brand.name, short_name: brand.name.slice(0, 24),
    id: 'https://client.example.test/e/approved-event/', start_url: 'https://client.example.test/e/approved-event/home',
    icons: [{ src: 'https://api.example.test/api/v1/public/events/approved-event/branding/assets/publication/icon-192', type: 'image/png' }] });
  expect(response.text).not.toContain('attacker');
  Object.assign(config, { CLIENT_BASE_URL: undefined });
  const sharedOrigin = await request(app).get('/approved-event/manifest');
  expect(JSON.parse(sharedOrigin.text).start_url).toBe('https://api.example.test/e/approved-event/home');
});

it('uses immutable caching only for exact versioned CSS and approved rasters', async () => {
  const current = await request(app).get('/approved-event/theme');
  expect(current.status).toBe(200);
  expect(current.headers['cache-control']).toBe('no-cache');
  expect(current.headers['content-type']).toContain('text/css');
  expect(reads.publication).toHaveBeenCalledWith({ slug: 'approved-event', publicationId: undefined });
  const version = await request(app).get('/approved-event/theme?v=publication');
  expect(version.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(reads.publication).toHaveBeenLastCalledWith({ slug: 'approved-event', publicationId: 'publication' });
  expect((await request(app).get('/approved-event/theme?v=publication').set('If-None-Match', version.headers.etag!)).status).toBe(304);
  const asset = await request(app).get('/approved-event/assets/publication/icon-192');
  expect(asset.status).toBe(200);
  expect(asset.body).toEqual(Buffer.from([137, 80, 78, 71]));
  expect(asset.headers['content-type']).toBe('image/png');
  expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(reads.asset).toHaveBeenCalledWith({ slug: 'approved-event', publicationId: 'publication', variant: 'icon-192' });
});
