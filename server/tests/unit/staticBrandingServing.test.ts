import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import type { PublicBranding } from '@spoh/shared';
import { staticClient } from '../../src/platform/http/staticClient.js';
import { describeStaticHtml } from '../../src/platform/http/staticClientManifest.js';

const exportBase = fileURLToPath(new URL('../../coverage/', import.meta.url));
mkdirSync(exportBase, { recursive: true });
const root = mkdtempSync(join(exportBase, 'p14-brand-static-'));
const html = '<!doctype html><html><head><title>Neutral</title><script>self.__next_f.push([1,"exact"])</script></head><body>Home</body></html>';
const documents = ['index.html', 'sign-in.html', 'e/_/home.html', '404.html'].sort();
for (const name of documents) {
  mkdirSync(dirname(join(root, name)), { recursive: true });
  writeFileSync(join(root, name), html);
}
writeFileSync(`${root}.csp.json`, JSON.stringify({ version: 1,
  documents: documents.map((name) => describeStaticHtml(name, Buffer.from(html))) }));
afterAll(() => {
  if (!resolve(root).startsWith(resolve(exportBase) + sep)) throw new Error('Unsafe temporary export path');
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}.csp.json`);
});

const brand: PublicBranding = {
  slug: 'brand-a', name: 'Approved <event>', accent: '#8844aa', publicationId: 'publication',
  publicationVersion: 1, logo: null, icons: [],
  themePath: '/api/v1/public/events/brand-a/branding/theme.css?v=publication',
  manifestPath: '/api/v1/public/events/brand-a/branding/manifest.webmanifest',
};
const read = vi.fn(async (slug: string) => slug === 'brand-a' ? { data: brand, etag: 'publication-etag' } : null);
const app = express().use(staticClient(root, 'https://api.example.test', { publicBranding: read }));
beforeEach(() => read.mockClear());

it('selects approved identity for an event alias and sign-in return path without changing script text', async () => {
  for (const address of ['/e/brand-a/home?view=normal', '/sign-in?returnTo=%2Fe%2Fbrand-a%2Fhome']) {
    const response = await request(app).get(address);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title data-event-branding="true">Approved &lt;event&gt;</title>');
    expect(response.text).toContain('https://api.example.test/api/v1/public/events/brand-a/branding/theme.css?v=publication');
    expect(response.text).toContain('<script>self.__next_f.push([1,"exact"])</script>');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(Number(response.headers['content-length'])).toBe(Buffer.byteLength(response.text));
  }
  expect(read.mock.calls).toEqual([['brand-a'], ['brand-a']]);
});

it('uses final branded HTML for GET/HEAD and conditional response identities', async () => {
  const get = await request(app).get('/e/brand-a/home');
  const head = await request(app).head('/e/brand-a/home');
  expect(head.status).toBe(200);
  expect(head.text).toBeUndefined();
  expect(head.headers.etag).toBe(get.headers.etag);
  expect(head.headers['content-length']).toBe(get.headers['content-length']);
  const fresh = await request(app).get('/e/brand-a/home').set('If-None-Match', get.headers.etag!);
  expect(fresh.status).toBe(304);
  expect(fresh.text).toBe('');
  expect(fresh.headers['cache-control']).toBe('no-cache');
});

it('keeps neutral or missing resources honest and does not load branding for non-document writes', async () => {
  for (const address of ['/', '/sign-in', '/sign-in?returnTo=https%3A%2F%2Fforeign.test%2Fe%2Fbrand-a%2Fhome']) {
    expect((await request(app).get(address)).text).toBe(html);
  }
  expect(read).not.toHaveBeenCalled();
  const missing = await request(app).get('/e/brand-a/missing');
  expect(missing.status).toBe(404);
  expect(missing.text).toBe(html);
  expect(read).not.toHaveBeenCalled();
  expect((await request(app).post('/e/brand-a/home')).status).toBe(404);
  expect(read).not.toHaveBeenCalled();
  expect((await request(app).get('/e/unpublished/home')).text).toBe(html);
  expect(read.mock.calls).toEqual([['unpublished']]);
});

it('propagates publication reader errors without serving a misleading neutral success', async () => {
  const failed = express().use(staticClient(root, '', { publicBranding: async () => { throw new Error('storage unavailable'); } }));
  failed.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(503).json({ error: 'Published identity unavailable' });
  });
  const response = await request(failed).get('/e/brand-a/home');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'Published identity unavailable' });
  expect(response.text).not.toContain('Neutral');
});
