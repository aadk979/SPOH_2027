import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { chromium } from '@playwright/test';
import { staticClient } from '../../../server/src/platform/http/staticClient.ts';

const root = fileURLToPath(new URL('../../out', import.meta.url));
const configuration = {
  version: 1,
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

test('the real static export validates startup without CSP evaluation or an auth fallback', async () => {
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
          globalThis.window.cspEvents.push({
            directive: event.violatedDirective,
            blocked: event.blockedURI,
          });
        });
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', () => pageErrors.push('APP_PAGE_ERROR'));
      const response = await page.goto(`${origin}/sign-in`);
      assert.equal(response.status(), 200);
      const csp = response.headers()['content-security-policy'];
      assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"));
      assert.ok(!csp.includes('unsafe-eval'));
      const signIn = page.getByRole('link', { name: 'Continue to sign in' });
      await signIn.waitFor();
      const destination = new URL(await signIn.getAttribute('href'), origin);
      assert.equal(destination.origin, origin);
      assert.equal(destination.pathname, '/api/v1/auth/login');
      assert.equal(await page.getByLabel('Roster email').count(), 0);
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      await page.reload();
      await signIn.waitFor();
      assert.deepEqual(await page.evaluate(() => globalThis.window.cspEvents), []);
      assert.deepEqual(pageErrors, []);
      await context.close();
    }
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/api/v1/client-config', (route) =>
      route.fulfill({
        json: { data: { ...configuration, apiBaseUrl: 'javascript:invalid' } },
      }),
    );
    const page = await context.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.getByRole('heading', { name: 'Unable to start' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Continue to sign in' }).count(), 0);
    assert.equal(await page.getByLabel('Roster email').count(), 0);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
