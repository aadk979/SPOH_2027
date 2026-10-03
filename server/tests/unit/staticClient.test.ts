import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import {
  exportedPath,
  segmentPayloadPath,
  staticClient,
} from '../../src/platform/http/staticClient.js';

/** The client's static export served beside the API (P08.4, spike findings). */

const root = mkdtempSync(join(tmpdir(), 'spoh-client-'));
const files: Record<string, string> = {
  'index.html': 'root',
  'sign-in.html': 'sign-in page',
  'map.html': 'map page',
  'map/__next.map/__PAGE__.txt': 'map payload',
  'e/_/home.html': 'event home',
  'e/_/home/__next.e/$d$event/home/__PAGE__.txt': 'event payload',
  '_next/static/chunks/app-1a2b.js': 'chunk',
  'sw.js': 'worker',
  '404.html': 'not found page',
};
for (const [path, body] of Object.entries(files)) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}
afterAll(() => rmSync(root, { recursive: true, force: true }));

const app = express().use(staticClient(root));

describe('path mapping', () => {
  it.each([
    ['/map/__next.map.__PAGE__.txt', '/map/__next.map/__PAGE__.txt'],
    [
      '/capture/stamp/__next.capture.stamp.__PAGE__.txt',
      '/capture/stamp/__next.capture/stamp/__PAGE__.txt',
    ],
    ['/map/__next._tree.txt', '/map/__next._tree.txt'],
    ['/map.html', '/map.html'],
  ])('reads the payload %s from %s', (requested, file) => {
    expect(segmentPayloadPath(requested)).toBe(file);
  });

  it('maps every event to the one placeholder segment', () => {
    const exists = (path: string) => path === '/e/_/home.html';
    expect(exportedPath('/e/spoh2027/home', exists)).toBe('/e/_/home.html');
    expect(exportedPath('/e/other/home/__next.e.other.home.__PAGE__.txt', exists)).toBe(
      '/e/_/home/__next.e/$d$event/home/__PAGE__.txt',
    );
  });
});

describe('serving', () => {
  it.each([
    ['/', 'root'],
    ['/sign-in', 'sign-in page'],
    ['/e/spoh2027/home', 'event home'],
    ['/map/__next.map.__PAGE__.txt?_rsc=abc', 'map payload'],
    ['/e/x/home/__next.e.x.home.__PAGE__.txt', 'event payload'],
  ])('serves %s', async (path, body) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(200);
    expect(response.text).toBe(body);
  });

  it('caches hashed assets for good and pages and the worker not at all', async () => {
    const chunk = await request(app).get('/_next/static/chunks/app-1a2b.js');
    expect(chunk.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const path of ['/sign-in', '/sw.js']) {
      expect((await request(app).get(path)).headers['cache-control']).toBe('no-cache');
    }
  });

  it("sends the client's own security policy, with the API as the only connect target", async () => {
    const csp = (await request(app).get('/sign-in')).headers['content-security-policy'];
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('answers an unknown route with the 404 page and a 404', async () => {
    const response = await request(app).get('/nowhere');
    expect(response.status).toBe(404);
    expect(response.text).toBe('not found page');
  });

  it('permits the runtime API origin without changing the exported files or widening other directives', async () => {
    const stage = express().use(staticClient(root, 'https://api.example.test'));
    const response = await request(stage).get('/sign-in');
    expect(response.text).toBe('sign-in page');
    expect(response.headers['content-security-policy']).toContain(
      "connect-src 'self' https://api.example.test;",
    );
    expect(response.headers['content-security-policy']).toContain("form-action 'self'");
  });

  it.each([
    'https://api.example.test/path',
    'https://api.example.test; script-src *',
    'https://user:pass@api.example.test',
  ])('refuses an unsafe CSP destination %s', async (origin) => {
    const unsafe = express().use(staticClient(root, origin));
    const csp = (await request(unsafe).get('/sign-in')).headers['content-security-policy'];
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain(origin);
  });

  it('never serves outside the export', async () => {
    const response = await request(app).get('/..%2f..%2fpackage.json');
    expect(response.status).toBe(404);
  });
});
