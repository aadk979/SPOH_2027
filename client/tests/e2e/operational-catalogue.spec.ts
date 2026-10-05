import { expect, test, type Page } from '@playwright/test';
import { ScopedSettingsReadResponse, ScopedSettingsHistoryResponse } from '@spoh/shared';
import { source as axe } from 'axe-core';

async function checkAccessibility(page: Page) {
  await page.evaluate(axe);
  const violations = await page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run: (node: Document, options: object) => Promise<{ violations: { id: string }[] }>;
          };
        }
      ).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    ).violations.map(({ id }) => id),
  );
  expect(violations).toEqual([]);
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(`operational catalogue (${name})`, () => {
    test.use({
      viewport: { width, height },
      isMobile: name === 'phone',
      hasTouch: name === 'phone',
    });
    for (const scope of ['event', 'station'] as const) {
      test(`reads registered values and owned history at ${scope} scope without setting writes`, async ({
        page,
      }) => {
        const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
        if (
          database.hostname !== 'localhost' ||
          database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
        )
          throw new Error('Dedicated local catalogue browser database required');
        const errors: string[] = [],
          failures: number[] = [],
          writes: string[] = [],
          violations: string[] = [];
        page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
        page.on('response', (response) => {
          if (response.status() === 429 || response.status() >= 500)
            failures.push(response.status());
          if (response.url().includes('/admin/settings/catalogue'))
            expect(response.headers()['cache-control']).toBe('no-store');
        });
        page.on('request', (request) => {
          if (request.url().includes('/admin/settings/catalogue') && request.method() !== 'GET')
            writes.push(request.method());
        });
        await page.exposeBinding('__catalogueCsp', (_source, directive: string) =>
          violations.push(directive),
        );
        await page.addInitScript(() => {
          addEventListener(
            'securitypolicyviolation',
            (event) =>
              void (
                globalThis as unknown as { __catalogueCsp: (directive: string) => void }
              ).__catalogueCsp(event.effectiveDirective),
          );
        });
        await page.goto('/sign-in');
        await page.getByLabel('Roster email').fill('chief@spoh2027.test');
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.waitForURL('**/home');
        await page.goto('/admin/settings');
        const panel = page.getByRole('button', { name: 'Settings catalogue', exact: true });
        await expect(panel).toHaveAttribute('aria-expanded', 'false');
        const firstRead = page.waitForResponse(
          (response) =>
            response.url().includes('/admin/settings/catalogue?') &&
            response.request().method() === 'GET',
        );
        await panel.click();
        const eventResponse = await firstRead;
        expect(eventResponse.status()).toBe(200);
        const initialEvent = ScopedSettingsReadResponse.parse(await eventResponse.json());
        expect(initialEvent.target).toEqual({ scope: 'event' });
        let initial = initialEvent;
        let selection = 'event';
        if (scope === 'station') {
          const selector = page.getByLabel('Catalogue scope');
          await expect(selector.locator('option')).not.toHaveCount(1);
          selection = (await selector.locator('option').nth(1).getAttribute('value')) ?? '';
          expect(selection).not.toBe('');
          const stationRead = page.waitForResponse(
            (response) =>
              response.url().includes('/admin/settings/catalogue?scope=station') &&
              response.request().method() === 'GET',
          );
          await selector.selectOption(selection);
          const response = await stationRead;
          expect(response.status()).toBe(200);
          initial = ScopedSettingsReadResponse.parse(await response.json());
          expect(initial.target).toEqual({ scope: 'station', stationId: selection });
        }
        await expect(page.getByRole('button', { name: /^View history:/ })).toHaveCount(
          scope === 'event' ? 14 : 3,
        );
        const originalCapture = initial.data.find((row) => row.key === 'capture.open')!;
        await expect(
          page.getByText(`Scoped value: ${originalCapture.value ? 'Open' : 'Paused'}`, {
            exact: true,
          }),
        ).toBeVisible();
        const ownedHistory = page.waitForResponse(
          (response) =>
            response.url().includes('/admin/settings/catalogue/history?') &&
            response.request().method() === 'GET',
        );
        await page.getByRole('button', { name: 'View history: Capture open', exact: true }).click();
        const historyResponse = await ownedHistory;
        expect(historyResponse.status()).toBe(200);
        const history = ScopedSettingsHistoryResponse.parse(await historyResponse.json());
        expect(history.eventId).toBe(initial.eventId);
        expect(history.target).toEqual(initial.target);
        expect(history.key).toBe('capture.open');
        await expect(
          page.getByRole('heading', { name: 'History: Capture open', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('list', { name: 'Catalogue history results' }).getByRole('listitem'),
        ).toHaveCount(history.data.length);
        if (history.meta.nextCursor) {
          const olderRead = page.waitForResponse(
            (response) =>
              response.url().includes('/admin/settings/catalogue/history?') &&
              new URL(response.url()).searchParams.get('cursor') === history.meta.nextCursor,
          );
          await page
            .getByRole('button', { name: 'Load more catalogue history', exact: true })
            .click();
          const response = await olderRead;
          expect(response.status()).toBe(200);
          const older = ScopedSettingsHistoryResponse.parse(await response.json());
          expect(older.target).toEqual(initial.target);
          expect(new Set([...history.data, ...older.data].map((row) => row.id)).size).toBe(
            history.data.length + older.data.length,
          );
        }
        await checkAccessibility(page);
        await page.getByRole('button', { name: 'Back to catalogue values', exact: true }).click();
        await page.reload();
        await expect(
          page.getByRole('button', { name: 'Settings catalogue', exact: true }),
        ).toHaveAttribute('aria-expanded', 'false');
        const reloadedRead = page.waitForResponse(
          (response) =>
            response.url().includes('/admin/settings/catalogue?scope=event') &&
            response.request().method() === 'GET',
        );
        await page.getByRole('button', { name: 'Settings catalogue', exact: true }).click();
        const reloaded = ScopedSettingsReadResponse.parse(await (await reloadedRead).json());
        expect(reloaded.data).toEqual(initialEvent.data);
        if (scope === 'station') {
          const stationReload = page.waitForResponse(
            (response) =>
              response.url().includes('/admin/settings/catalogue?scope=station') &&
              response.request().method() === 'GET',
          );
          await page.getByLabel('Catalogue scope').selectOption(selection);
          expect(ScopedSettingsReadResponse.parse(await (await stationReload).json()).data).toEqual(
            initial.data,
          );
        }
        const signOut = page.waitForResponse(
          (response) =>
            response.url().endsWith('/auth/session') && response.request().method() === 'DELETE',
        );
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        expect((await signOut).status()).toBe(204);
        await page.waitForURL('**/sign-in');
        expect(writes).toEqual([]);
        expect(failures).toEqual([]);
        expect(errors).toEqual([]);
        expect(violations).toEqual([]);
      });
    }
  });
}
