import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { PublicBranding } from '@spoh/shared';
import { exportedPath, segmentPayloadPath, staticClient } from '../../src/platform/http/staticClient.js';

const base = mkdtempSync(join(tmpdir(), 'spoh-client-'));
const root = join(base, 'out');
const script = (label: string) => `globalThis.page=${JSON.stringify(label)};`;
const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const html = (label: string) => `<!doctype html><html><head><title>${label}</title></head><body>${label}<script>${script(label)}</script></body></html>`;
const files: Record<string, string> = {
  'index.html': html('root'), 'sign-in.html': html('sign-in page'), 'map.html': html('map page'),
  'e/_/home.html': html('event home'), '404.html': html('not found page'),
  'map/__next.map/__PAGE__.txt': 'map payload', 'e/_/home/__next.e/$d$event/home/__PAGE__.txt': 'event payload',
  '_next/static/chunks/app-1a2b.js': 'chunk', 'sw.js': 'worker',
};
for (const [path, body] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); }
const labels: Record<string, string> = { 'index.html': 'root', 'sign-in.html': 'sign-in page', 'map.html': 'map page', 'e/_/home.html': 'event home', '404.html': 'not found page' };
writeFileSync(`${root}.csp.json`, JSON.stringify({ version: 1, documents: Object.keys(labels).sort().map((path) => ({
  path, sha256: createHash('sha256').update(files[path]!).digest('hex'), scriptHashes: [hash(script(labels[path]!))],
})) }));
afterAll(() => rmSync(base, { recursive: true, force: true }));
const app = express().use(staticClient(root));

describe('static export path and per-document policy selection', () => {
  it.each([['/map/__next.map.__PAGE__.txt', '/map/__next.map/__PAGE__.txt'], ['/map/__next._tree.txt', '/map/__next._tree.txt'], ['/map.html', '/map.html']])('maps %s to %s', (requested, file) => expect(segmentPayloadPath(requested)).toBe(file));
  it('maps every event to the placeholder and preserves navigation payloads', () => {
    const exists = (path: string) => path === '/e/_/home.html';
    expect(exportedPath('/e/spoh2027/home', exists)).toBe('/e/_/home.html');
    expect(exportedPath('/e/other/home/__next.e.other.home.__PAGE__.txt', exists)).toBe('/e/_/home/__next.e/$d$event/home/__PAGE__.txt');
  });
  it.each([['/', 'index.html'], ['/sign-in', 'sign-in.html'], ['/sign-in.html', 'sign-in.html'], ['/e/first/home', 'e/_/home.html'], ['/e/second/home', 'e/_/home.html']])('serves exact document %s with only its hashes', async (path, file) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(200); expect(response.text).toBe(files[file]!);
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain(hash(script(labels[file]!))); expect(csp).not.toMatch(/unsafe-|nonce-/);
    for (const other of Object.keys(labels).filter((candidate) => candidate !== file)) expect(csp).not.toContain(hash(script(labels[other]!)));
  });
  it.each([['/map/__next.map.__PAGE__.txt?_rsc=abc', 'map payload'], ['/e/x/home/__next.e.x.home.__PAGE__.txt', 'event payload']])('serves RSC without document hashes %s', async (path, body) => {
    const response = await request(app).get(path); expect(response.status).toBe(200); expect(response.text).toBe(body);
    expect(response.headers['content-security-policy']).not.toContain('sha256-');
  });
  it('retains asset/document cache semantics and serves fallback-specific hashes with 404', async () => {
    expect((await request(app).get('/_next/static/chunks/app-1a2b.js')).headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const path of ['/sign-in', '/sw.js']) expect((await request(app).get(path)).headers['cache-control']).toBe('no-cache');
    for (const path of ['/nowhere', '/..%2f..%2fpackage.json']) {
      const response = await request(app).get(path); expect(response.status).toBe(404); expect(response.text).toBe(files['404.html']);
      expect(response.headers['content-security-policy']).toContain(hash(script('not found page')));
    }
  });
  it('uses the same policy and byte-derived ETag for GET, HEAD and conditional GET', async () => {
    const get = await request(app).get('/sign-in'); const head = await request(app).head('/sign-in');
    const fresh = await request(app).get('/sign-in').set('If-None-Match', get.headers.etag as string);
    expect(head.status).toBe(200); expect(head.text).toBeUndefined(); expect(head.headers.etag).toBe(get.headers.etag);
    expect(fresh.status).toBe(304); expect(fresh.text).toBe('');
    expect(head.headers['content-security-policy']).toBe(get.headers['content-security-policy']);
    expect(fresh.headers['content-security-policy']).toBe(get.headers['content-security-policy']);
    expect(get.headers.etag).toBe(`"${createHash('sha256').update(files['sign-in.html']!).digest('hex')}"`);
  });
  it.each(['https://api.example.test/path', 'https://api.example.test; script-src *', 'https://user:pass@api.example.test'])('refuses unsafe destination at startup %s', (origin) => expect(() => staticClient(root, origin)).toThrow());
  it('permits exact API CSS/manifest and media uploads without adding script origins', async () => {
    const stage = express().use(staticClient(root, 'https://api.example.test', { bucket: 'spoh-synthetic-media', region: 'ap-southeast-1' }));
    const csp = (await request(stage).get('/sign-in')).headers['content-security-policy'] as string;
    expect(csp).toContain("style-src 'self' https://api.example.test;"); expect(csp).toContain("manifest-src 'self' https://api.example.test;");
    expect(csp).toContain("connect-src 'self' https://api.example.test https://spoh-synthetic-media.s3.ap-southeast-1.amazonaws.com;");
    expect(csp.split(';').find((directive) => directive.trim().startsWith('script-src '))).not.toContain('https://');
    expect(csp).toContain("style-src-attr 'none';"); expect(csp).not.toContain('*.amazonaws.com');
  });
  it('brands head metadata while retaining script hashes and recomputing the final ETag', async () => {
    let name = 'First identity';
    const branding = async (): Promise<{ data: PublicBranding; etag: string }> => ({ etag: 'ignored-provider-etag', data: {
      slug: 'open-day', name, accent: '#0066cc', publicationId: 'published', publicationVersion: 1, logo: null, icons: [],
      themePath: '/api/v1/public/events/open-day/branding/theme.css', manifestPath: '/api/v1/public/events/open-day/branding/manifest.webmanifest',
    } });
    const branded = express().use(staticClient(root, 'https://api.example.test', { publicBranding: branding }));
    const first = await request(branded).get('/sign-in?returnTo=%2Fe%2Fopen-day%2Fhome');
    expect(first.text).toContain(name); expect(first.text).toContain(script('sign-in page'));
    expect(first.headers['content-security-policy']).toContain(hash(script('sign-in page')));
    expect(first.headers.etag).toBe(`"${createHash('sha256').update(first.text).digest('hex')}"`);
    name = '<script>untrusted()</script>';
    const next = await request(branded).get('/sign-in?returnTo=%2Fe%2Fopen-day%2Fhome').set('If-None-Match', first.headers.etag as string);
    expect(next.status).toBe(200); expect(next.headers.etag).not.toBe(first.headers.etag);
    expect(next.text).toContain('&lt;script&gt;'); expect(next.headers['content-security-policy']).toBe(first.headers['content-security-policy']);
  });
});
