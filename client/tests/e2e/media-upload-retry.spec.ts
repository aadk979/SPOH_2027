import { readFileSync } from 'node:fs';
import { CreateUploadRequest } from '@spoh/shared';
import { expect, test } from '@playwright/test';
import { MOCK_EVENT, fulfillClientConfiguration } from './mockEvent';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(name, () => {
    test.use({
      viewport: { width, height },
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
    });
    test('retries the retained photo intent and attaches only the confirmed object key', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
      const policies: Array<ReturnType<typeof CreateUploadRequest.parse>> = [];
      const items: Array<Record<string, unknown>> = [];
      const objectUploads: Array<{ headers: Record<string, string>; body: string }> = [];
      const key = 'lost-found/2027/01/07/synthetic-retry.png';
      const volunteer = {
        id: 'synthetic-media-user',
        displayName: 'Synthetic Desk',
        role: 'VOLUNTEER',
      };
      // A permitted local cross-origin adapter isolates retry behavior; real S3/CSP is separate.
      await page.route('http://localhost:4012/synthetic-object-upload', async (route) => {
        const request = route.request();
        objectUploads.push({
          headers: request.headers(),
          body: request.postDataBuffer()?.toString('latin1') ?? '',
        });
        await route.fulfill({
          status: objectUploads.length === 1 ? 503 : 204,
          headers: { 'Access-Control-Allow-Origin': 'http://localhost:3001' },
        });
      });
      await page.route('**/api/v1/**', async (route) => {
        if (await fulfillClientConfiguration(route)) return;
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/media/uploads')) {
          policies.push(CreateUploadRequest.parse(route.request().postDataJSON()));
          await route.fulfill({
            status: 201,
            headers: { 'Cache-Control': 'no-store' },
            json: {
              key,
              url: 'http://localhost:4012/synthetic-object-upload',
              fields: { key, 'Content-Type': 'image/png', policy: 'synthetic-policy' },
              expiresIn: 300,
              maxBytes: 10000,
            },
          });
          return;
        }
        if (path.endsWith('/lost-found') && route.request().method() === 'POST') {
          items.push(route.request().postDataJSON() as Record<string, unknown>);
          await route.fulfill({ status: 201, json: { item: { id: 'synthetic-item' } } });
          return;
        }
        const json = path.endsWith('/api/v1/events')
          ? { data: [MOCK_EVENT] }
          : path.includes('/auth/')
            ? {
                accessToken: 'synthetic-browser-session',
                expiresIn: 3600,
                volunteer,
                refreshAvailable: true,
              }
            : path.endsWith('/me')
              ? {
                  volunteer,
                  event: MOCK_EVENT,
                  currentAssignment: { station: { id: 'synthetic-station', name: 'Desk' } },
                  upcomingAssignments: [],
                  escalationChain: [],
                }
              : path.endsWith('/media/config')
                ? { enabled: true }
                : path.endsWith('/lost-person/active')
                  ? { alerts: [] }
                  : path.endsWith('/lost-found')
                    ? { items: [] }
                    : {};
        await route.fulfill({ json });
      });
      await page.goto('/e/mock-event/safety/lost-found/new');
      await expect(page.getByRole('heading', { name: 'Log a found item' })).toBeVisible();
      await page.getByLabel('What is it?').fill('Synthetic object');
      await page.getByLabel(/^Photo/).setInputFiles({
        name: 'synthetic.png',
        mimeType: 'image/png',
        buffer: Buffer.from('synthetic-object-photo'),
      });
      const retry = page.getByRole('button', { name: 'Retry photo', exact: true });
      await expect(retry).toBeVisible();
      await retry.hover();
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        const runtime = window as unknown as { axe: typeof import('axe-core') };
        return (
          await runtime.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
          })
        ).violations.map(({ id }) => id);
      });
      expect(violations).toEqual([]);
      await retry.click();
      await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
      expect(policies).toHaveLength(2);
      expect(policies[1]).toEqual(policies[0]);
      expect(objectUploads).toHaveLength(2);
      for (const upload of objectUploads) {
        expect(upload.headers.authorization).toBeUndefined();
        expect(upload.headers.cookie).toBeUndefined();
        expect(upload.body.indexOf('name="policy"')).toBeLessThan(
          upload.body.indexOf('name="file"'),
        );
      }
      await page.getByRole('button', { name: 'Log this item', exact: true }).click();
      await expect(page).toHaveURL(/\/safety\/lost-found$/);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ itemLabel: 'Synthetic object', photoKey: key });
      expect(JSON.stringify(items)).not.toContain('synthetic-policy');
      expect(errors).toEqual([]);
    });
  });
}
