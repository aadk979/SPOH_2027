/* global document, window, getComputedStyle -- callbacks evaluated by Playwright in the browser */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { chromium } from '@playwright/test';
import { staticClient } from '../../../server/src/platform/http/staticClient.ts';

const root = fileURLToPath(new URL('../../out', import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}.csp.json`, 'utf8'));
const documentHashes = (path) => manifest.documents.find((document) => document.path === path).scriptHashes;
const configuration = {
  version: 2,
  mediaOrigin: null,
  apiBaseUrl: '',
  envLabel: 'test',
  authProvider: 'cognito',
  cognito: {
    region: 'test-region',
    userPoolId: 'synthetic-public-pool',
    clientId: 'synthetic-public-client',
    domain: 'https://identity.synthetic.test',
  },
};

function assertDocumentPolicy(policy, path) {
  const script = policy.split(';').find((directive) => directive.trim().startsWith('script-src ')).trim();
  assert.equal(script, ["script-src 'self'", ...documentHashes(path)].join(' '));
  assert.ok(policy.includes("script-src-attr 'none'"));
  assert.ok(policy.includes("style-src-attr 'none'"));
  assert.ok(!/unsafe-inline|unsafe-eval|nonce-/.test(policy));
}

test('the real static export hydrates with its document hashes and rejects inline script and style', async () => {
  const app = express();
  app.get('/api/v1/client-config', (_req, res) => res.json({ data: configuration }));
  app.post('/api/v1/auth/refresh', (_req, res) => res.status(401).json({}));
  app.use(staticClient(root));
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : { channel: 'chrome' }),
  });
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        globalThis.window.cspEvents = [];
        globalThis.document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.window.cspEvents.push({ directive: event.violatedDirective, blocked: event.blockedURI });
        });
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', () => pageErrors.push('APP_PAGE_ERROR'));
      const response = await page.goto(`${origin}/sign-in`);
      assert.equal(response.status(), 200);
      assertDocumentPolicy(response.headers()['content-security-policy'], 'sign-in.html');
      const signIn = page.getByRole('link', { name: 'Continue to sign in' });
      await signIn.waitFor();
      const destination = new URL(await signIn.getAttribute('href'), origin);
      assert.equal(destination.origin, origin);
      assert.equal(destination.pathname, '/api/v1/auth/login');
      assert.equal(await page.getByLabel('Roster email').count(), 0);
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      const dimensions = await page.evaluate(() => {
        const host = document.createElement('div');
        document.body.append(host);
        const widths = [0, 50, 100].map((width) => {
          const bar = document.createElement('div');
          bar.className = `bar-width-${width}`;
          host.append(bar);
          return bar.getBoundingClientRect().width / host.getBoundingClientRect().width;
        });
        const skeleton = document.createElement('div');
        skeleton.className = 'spoh-skeleton-field';
        host.append(skeleton);
        const height = skeleton.getBoundingClientRect().height;
        const select = document.createElement('select');
        select.className = 'spoh-select';
        host.append(select);
        const chevron = getComputedStyle(select).backgroundImage;
        host.remove();
        return { widths, height, chevron };
      });
      assert.deepEqual(dimensions.widths, [0, 0.5, 1]);
      assert.equal(dimensions.height, 48);
      assert.ok(dimensions.chevron.startsWith('url("data:image/svg+xml,'));
      // DOM evaluation is test instrumentation. The inserted classic script must still obey CSP.
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.__unexpectedInlineScript = true;';
        document.body.append(script);
        const probe = document.createElement('div');
        probe.id = 'csp-style-probe';
        probe.className = 'spoh-skeleton-field';
        document.body.append(probe);
        probe.setAttribute('style', 'height: 123px');
      });
      await page.waitForFunction(() =>
        window.cspEvents.some((event) => event.directive.startsWith('script-src')) &&
        window.cspEvents.some((event) => event.directive === 'style-src-attr'),
      );
      assert.equal(await page.evaluate(() => window.__unexpectedInlineScript), undefined);
      assert.equal(await page.locator('#csp-style-probe').evaluate((element) => element.getBoundingClientRect().height), 48);
      await page.reload();
      await signIn.waitFor();
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      assert.deepEqual(pageErrors, []);
      const missing = await page.goto(`${origin}/synthetic-unknown-route`);
      assert.equal(missing.status(), 404);
      assertDocumentPolicy(missing.headers()['content-security-policy'], '404.html');
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      const payloads = [];
      page.on('response', (response) => { if (new URL(response.url()).pathname.endsWith('.txt')) payloads.push(response); });
      await page.getByRole('link', { name: 'Back to Home' }).click();
      await page.getByRole('link', { name: 'Continue to sign in' }).waitFor();
      assert.ok(payloads.length > 0, 'client navigation used the actual exported RSC payloads');
      for (const payload of payloads) assert.ok(!payload.headers()['content-security-policy'].includes('sha256-'));
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      assert.deepEqual(pageErrors, []);
      await context.close();
    }
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/api/v1/client-config', (route) =>
      route.fulfill({ json: { data: { ...configuration, apiBaseUrl: 'javascript:invalid' } } }),
    );
    const page = await context.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.getByRole('heading', { name: 'Unable to start' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Continue to sign in' }).count(), 0);
    assert.equal(await page.getByLabel('Roster email').count(), 0);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('actual cross-origin anonymous branding styles and manifests load under strict document CSP', async () => {
  let clientOrigin = '';
  const delivered = [];
  const branding = (slug) => ({ slug, name: `Published ${slug}`, accent: slug === 'brand-a' ? '#551177' : '#115577',
    publicationId: 'approved', publicationVersion: 1, logo: null, icons: [],
    themePath: `/api/v1/public/events/${slug}/branding/theme.css`,
    manifestPath: `/api/v1/public/events/${slug}/branding/manifest.webmanifest` });
  const api = express();
  api.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', clientOrigin);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (req.path.includes('/branding')) delivered.push({ path: req.path, authorization: req.get('authorization'), cookie: req.get('cookie'), origin: req.get('origin') });
    next();
  });
  api.post('/api/v1/auth/refresh', (_req, res) => res.status(401).json({}));
  api.get('/api/v1/public/events/:slug/branding', (req, res) => {
    if (!['brand-a', 'brand-b'].includes(req.params.slug)) { res.status(404).json({}); return; }
    res.json({ data: branding(req.params.slug) });
  });
  api.get('/api/v1/public/events/:slug/branding/theme.css', (req, res) => res.type('css').send(`:root{--color-primary:${branding(req.params.slug).accent};--color-focus:${branding(req.params.slug).accent};--color-on-primary:#ffffff}`));
  api.get('/api/v1/public/events/:slug/branding/manifest.webmanifest', (req, res) => res.type('application/manifest+json').send({
    id: `/e/${req.params.slug}/`, name: branding(req.params.slug).name, short_name: branding(req.params.slug).name,
    scope: `/e/${req.params.slug}/`, start_url: `/e/${req.params.slug}/home`, display: 'standalone', icons: [],
  }));
  const apiServer = createServer(api).listen(0, '127.0.0.1'); await once(apiServer, 'listening');
  // Different browser sites exercise anonymous CORS despite the deliberately same-site CORP header.
  const apiOrigin = `http://localhost:${apiServer.address().port}`;
  const client = express();
  client.get('/api/v1/client-config', (_req, res) => res.json({ data: { ...configuration, apiBaseUrl: apiOrigin } }));
  client.use(staticClient(root, apiOrigin, { publicBranding: async (slug) => ['brand-a', 'brand-b'].includes(slug)
    ? { data: branding(slug), etag: 'approved' } : null }));
  const clientServer = createServer(client).listen(0, '127.0.0.1'); await once(clientServer, 'listening');
  clientOrigin = `http://127.0.0.1:${clientServer.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : { channel: 'chrome' }) });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addInitScript(() => { window.cspEvents = []; document.addEventListener('securitypolicyviolation', (event) => window.cspEvents.push(event.violatedDirective)); });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', () => errors.push('PAGE_ERROR'));
      for (const slug of ['brand-a', 'brand-b']) {
        const manifestResponse = page.waitForResponse((result) => new URL(result.url()).pathname === branding(slug).manifestPath);
        const response = await page.goto(`${clientOrigin}/sign-in?returnTo=${encodeURIComponent(`/e/${slug}/home`)}`);
        assertDocumentPolicy(response.headers()['content-security-policy'], 'sign-in.html');
        await page.getByRole('link', { name: 'Continue to sign in' }).waitFor();
        await page.waitForFunction((accent) => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() === accent, branding(slug).accent);
        assert.equal(await page.locator('link[data-event-branding][rel="stylesheet"]').getAttribute('crossorigin'), 'anonymous');
        assert.equal(await page.locator('link[rel="manifest"]').getAttribute('crossorigin'), 'anonymous');
        const manifestResult = await manifestResponse;
        assert.equal(manifestResult.status(), 200);
        assert.equal(manifestResult.headers()['access-control-allow-origin'], clientOrigin);
        assert.ok(delivered.some((request) => request.path === branding(slug).manifestPath), 'the browser fetched the actual manifest');
        assert.deepEqual(await page.evaluate(() => window.cspEvents), []);
      }
      await page.goto(`${clientOrigin}/sign-in?returnTo=${encodeURIComponent('/e/unpublished/home')}`);
      await page.getByRole('link', { name: 'Continue to sign in' }).waitFor();
      assert.equal(await page.locator('link[data-event-branding]').count(), 0);
      assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.json');
      assert.deepEqual(errors, []); await context.close();
    }
    assert.ok(delivered.some((request) => request.path.endsWith('/theme.css')));
    assert.ok(delivered.every((request) => !request.authorization && !request.cookie));
    assert.ok(delivered.filter((request) => /theme\.css|manifest\.webmanifest/.test(request.path)).every((request) => request.origin === clientOrigin));
  } finally {
    await browser.close();
    await Promise.all([clientServer, apiServer].map((server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  }
});
