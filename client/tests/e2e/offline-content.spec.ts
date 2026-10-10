import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { PublishedContentRecord } from '@spoh/shared';
import { GUIDE, PUBLISHED_GUIDE } from '../helpers/content';
import { IDENTITY_EVENT, IDENTITY_PERSON, IDENTITY_SESSION } from './identityUiFixture';
import { fulfillClientConfiguration } from './mockEvent';

const ROOT = `/api/v1/events/${IDENTITY_EVENT.id}/content`;
const IMAGE_PATH = `${ROOT}/assets/${PUBLISHED_GUIDE.id}/map-0`;
const IMAGE_KEY = `content/${IDENTITY_EVENT.id}/${PUBLISHED_GUIDE.id}/map-0`;
const FLOOR_ALT = 'Synthetic floor plan with an exit and welcome desk';
const DRAFT_ONLY = 'UNPUBLISHED DRAFT: this text must never be available offline';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVr0AAAAASUVORK5CYII=',
  'base64',
);
const publication: PublishedContentRecord = {
  ...PUBLISHED_GUIDE,
  eventId: IDENTITY_EVENT.id,
  body: {
    ...GUIDE,
    map: {
      ...GUIDE.map,
      levels: [{ ...GUIDE.map.levels[0]!, image: { mediaKey: IMAGE_KEY, alt: FLOOR_ALT } }],
    },
  },
  path: `${ROOT.replace('/api/v1', '')}?v=${PUBLISHED_GUIDE.id}`,
  images: { [IMAGE_KEY]: IMAGE_PATH.replace('/api/v1', '') },
};

async function fixture(context: BrowserContext) {
  let unavailable = false;
  let draftReads = 0;
  // Context routes also see the worker's own network fetches; page routes do not.
  // https://playwright.dev/docs/service-workers#network-events-and-routing
  await context.route('**/api/v1/**', async (route) => {
    if (unavailable) return route.abort('internetdisconnected');
    if (await fulfillClientConfiguration(route)) return;
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === ROOT || path === IMAGE_PATH || path === `${ROOT}/draft`) {
      expect(route.request().headers().authorization).toBe(`Bearer ${IDENTITY_SESSION.accessToken}`);
      if (path === IMAGE_PATH) {
        await route.fulfill({ contentType: 'image/png', headers: { 'Cache-Control': 'private, max-age=31536000, immutable' }, body: PNG });
      } else if (path.endsWith('/draft')) {
        draftReads += 1;
        await route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: { data: { body: DRAFT_ONLY } } });
      } else {
        await route.fulfill({
          headers: { ETag: publication.etag, 'Cache-Control': url.searchParams.has('v') ? 'private, max-age=31536000, immutable' : 'no-store' },
          json: { data: publication },
        });
      }
      return;
    }
    const json = path.endsWith('/events/administration')
      ? { organisations: [], events: [] }
      : path.endsWith('/api/v1/events')
        ? { data: [IDENTITY_EVENT] }
        : path.includes('/auth/')
          ? { ...IDENTITY_SESSION, expiresIn: 120, refreshAvailable: false }
          : path.endsWith('/me/permissions')
            ? { actions: { 'Self.Read': true, 'Settings.Read': true }, settings: { operational: false, security: false, privacy: false } }
            : path.endsWith('/me')
              ? { volunteer: IDENTITY_PERSON, event: IDENTITY_EVENT, currentAssignment: null, upcomingAssignments: [], escalationChain: [] }
              : path.endsWith('/lost-person/active')
                ? { alerts: [] }
                : path.endsWith('/stations')
                  ? { data: [] }
                  : {};
    await route.fulfill({ json });
  });
  return { disconnect: () => { unavailable = true; }, draftReads: () => draftReads };
}

async function activateWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) await navigator.serviceWorker.register('/sw.js?v=p13-content-campaign');
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
}

async function publishedCacheRequests(page: Page) {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('spoh2027-published-'));
    const requests = (await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))).flat();
    return requests.map((request) => ({ url: request.url, authorization: request.headers.get('Authorization') }));
  });
}

for (const [name, width, height] of [['phone', 390, 844], ['laptop', 1440, 900]] as const) {
  test(`published guide and precached floor plan reopen offline after access expires (${name})`, async ({ page, context, baseURL }) => {
    // Written during the build batch; execute with the P16 browser campaign (ADR-011).
    if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
      throw new Error('The local campaign app is required; this fixture does not contact live services');
    }
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.clock.install();
    const network = await fixture(context);
    let offlineVersions = 0;
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname === ROOT && url.searchParams.get('v') === publication.id && response.fromServiceWorker()) offlineVersions += 1;
    });
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Your events', exact: true })).toBeVisible();
    await activateWorker(page);
    await page.goto(`/e/${IDENTITY_EVENT.slug}/map`);
    const image = page.getByRole('img', { name: FLOOR_ALT });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(async () => (await publishedCacheRequests(page)).map(({ url }) => new URL(url).pathname).sort()).toEqual([ROOT, IMAGE_PATH].sort());
    await page.evaluate(async ({ root, proof }) => {
      await fetch(`${root}/draft`, { headers: { Authorization: proof }, cache: 'no-store' });
    }, { root: ROOT, proof: `Bearer ${IDENTITY_SESSION.accessToken}` });
    expect(network.draftReads()).toBe(1);
    const navigation = page.getByRole('navigation', { name: 'Main sections' });
    await navigation.getByRole('link', { name: 'Guide', exact: true }).click();
    await page.getByRole('link', { name: /What do I say/ }).click();
    await expect(page.getByText(GUIDE.brief.escalationScript, { exact: true })).toBeVisible();
    await navigation.getByRole('link', { name: 'Guide', exact: true }).click();
    await page.getByRole('link', { name: /^Floor map/ }).click();
    await expect(image).toBeVisible();
    const beforeDisconnect = offlineVersions;
    network.disconnect();
    await context.setOffline(true);
    try {
      await page.clock.fastForward(121_000);
      await navigation.getByRole('link', { name: 'Guide', exact: true }).click();
      await page.getByRole('link', { name: /What do I say/ }).click();
      await expect(page.getByText(/Offline copy · published version 1/)).toBeVisible();
      await expect(page.getByText(GUIDE.brief.escalationScript, { exact: true })).toBeVisible();
      await expect.poll(() => offlineVersions).toBeGreaterThan(beforeDisconnect);
      await navigation.getByRole('link', { name: 'Guide', exact: true }).click();
      await page.getByRole('link', { name: /^Floor map/ }).click();
      await expect(image).toBeVisible();
      const bytes = await page.evaluate(async ({ path, proof }) => {
        const response = await fetch(path, { headers: { Authorization: proof }, cache: 'no-store' });
        return (await response.blob()).size;
      }, { path: IMAGE_PATH, proof: `Bearer ${IDENTITY_SESSION.accessToken}` });
      expect(bytes).toBe(PNG.length);
      const draftAvailable = await page.evaluate(async ({ root, proof }) => {
        try { await fetch(`${root}/draft`, { headers: { Authorization: proof }, cache: 'no-store' }); return true; }
        catch { return false; }
      }, { root: ROOT, proof: `Bearer ${IDENTITY_SESSION.accessToken}` });
      expect(draftAvailable).toBe(false);
      const cached = await publishedCacheRequests(page);
      expect(cached).toHaveLength(2);
      expect(cached.every(({ url, authorization }) => !url.includes('/draft') && authorization === null)).toBe(true);
      await expect(page.getByText(DRAFT_ONLY)).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/sign-in/);
    } finally {
      await context.setOffline(false);
    }
  });
}
