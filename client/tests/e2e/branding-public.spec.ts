import { readFileSync } from 'node:fs';
import type { PublicBranding } from '@spoh/shared';
import { expect, test, type Page, type Route } from '@playwright/test';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOeUAAAAASUVORK5CYII=', 'base64');
const identity = (slug: string): PublicBranding => ({
  slug, name: `Published ${slug}`, accent: slug === 'brand-a' ? '#551177' : '#115577', publicationId: 'approved', publicationVersion: 1,
  logo: { path: `/api/v1/public/events/${slug}/branding/assets/approved/logo`, alt: `${slug} public mark` }, icons: [],
  themePath: `/api/v1/public/events/${slug}/branding/theme.css?v=approved`, manifestPath: `/api/v1/public/events/${slug}/branding/manifest.webmanifest`,
});
async function replyPublic(route: Route, slug: string, suffix: string, query: string): Promise<boolean> {
  const published = slug === 'brand-a' || slug === 'brand-b';
  if (suffix === '' && query === '') {
    await route.fulfill(published ? { json: { data: identity(slug) } } : { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Unavailable', requestId: 'neutral-brand' } } });
    return true;
  }
  if (!published) return false;
  if (suffix === '/theme.css' && query === '?v=approved') {
    await route.fulfill({ contentType: 'text/css', body: `:root{--color-primary:${identity(slug).accent};--color-focus:${identity(slug).accent};--color-on-primary:#ffffff}` }); return true;
  }
  if (suffix === '/manifest.webmanifest' && query === '') {
    await route.fulfill({ contentType: 'application/manifest+json', json: { id: `/e/${slug}/`, name: identity(slug).name, short_name: identity(slug).name, scope: `/e/${slug}/`, start_url: `/e/${slug}/home`, display: 'standalone', icons: [] } }); return true;
  }
  if (suffix === '/assets/approved/logo' && query === '') {
    await route.fulfill({ contentType: 'image/png', body: png }); return true;
  }
  return false;
}
async function anonymousFixture(page: Page) {
  const unexpected: string[] = [];
  const publicHeaders: Record<string, string>[] = [];
  page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/v1/client-config' && url.search === '') {
      await route.fulfill({ json: { data: { version: 1, apiBaseUrl: '', envLabel: 'development', authProvider: 'local', cognito: null } } }); return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/refresh' && url.search === '') {
      await route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required', requestId: 'anonymous' } } }); return;
    }
    const publicPath = /^\/api\/v1\/public\/events\/([a-z0-9-]+)\/branding(.*)$/.exec(url.pathname);
    if (request.method() === 'GET' && publicPath) {
      publicHeaders.push(request.headers());
      if (await replyPublic(route, publicPath[1]!, publicPath[2]!, url.search)) return;
    }
    unexpected.push(`${request.method()} ${url.pathname}${url.search}`);
    await route.fulfill({ status: 500, json: { error: { code: 'UNEXPECTED_FIXTURE_REQUEST', message: 'Unexpected request', requestId: 'fixture' } } });
  });
  return { unexpected, publicHeaders };
}
for (const [device, width, height] of [['phone', 390, 844], ['laptop', 1440, 900]] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${device} ${colorScheme}: anonymous identity follows the exact event and returns to neutral`, async ({ page }) => {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme });
      const fixture = await anonymousFixture(page);
      for (const slug of ['brand-a', 'brand-b']) {
        await page.goto(`/sign-in?returnTo=${encodeURIComponent(`/e/${slug}/home`)}`);
        await expect(page).toHaveTitle(identity(slug).name);
        await expect(page.getByText(identity(slug).name, { exact: true })).toBeVisible();
        await expect(page.getByAltText(`${slug} public mark`)).toBeVisible();
        await expect(page.locator('link[data-event-branding][rel="stylesheet"]')).toHaveAttribute('href', identity(slug).themePath);
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).toBe(identity(slug).accent);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(async () => {
          const runtime = window as unknown as { axe: typeof import('axe-core') };
          return (await runtime.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map(({ id }) => id);
        });
        expect(violations).toEqual([]);
        await page.screenshot({ path: `test-results/branding-${device}-${colorScheme}-${slug}.png`, fullPage: true });
      }
      for (const returnTo of ['/e/unpublished/home', 'https://external.test/e/brand-a/home']) {
        await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
        await expect(page).toHaveTitle('Volunteer operations');
        await expect(page.locator('link[data-event-branding]')).toHaveCount(0);
        await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
        await expect(page.getByText('Volunteer operations', { exact: true })).toBeVisible();
      }
      expect(fixture.publicHeaders.length).toBeGreaterThan(0);
      expect(fixture.publicHeaders.every((headers) => !headers.authorization)).toBe(true);
      expect(fixture.unexpected).toEqual([]);
    });
  }
}
