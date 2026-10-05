import { expect, test } from '@playwright/test';
import { ScopedSettingsHistoryResponse, ScopedSettingsReadResponse } from '@spoh/shared';
import { primeVisualAccounts } from './primeAccounts';

test.beforeAll(async ({ request }) => primeVisualAccounts(request));
for (const state of [
  'event values',
  'station values',
  'history',
  'restore value',
  'restore removal',
] as const) {
  test(`operational catalogue ${state}`, async ({ page }) => {
    const errors: string[] = [],
      failures: number[] = [],
      writes: string[] = [],
      violations: string[] = [];
    page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
    page.on('response', (response) => {
      if (response.status() === 429 || response.status() >= 500) failures.push(response.status());
    });
    page.on('request', (request) => {
      if (request.url().includes('/admin/settings/catalogue') && request.method() !== 'GET')
        writes.push(request.method());
    });
    await page.exposeBinding('__catalogueVisualCsp', (_source, directive: string) =>
      violations.push(directive),
    );
    await page.addInitScript(() => {
      addEventListener(
        'securitypolicyviolation',
        (event) =>
          void (
            globalThis as unknown as { __catalogueVisualCsp: (directive: string) => void }
          ).__catalogueVisualCsp(event.effectiveDirective),
      );
    });
    // History-only GET fixtures show validated set/removal semantics without changing frozen rows.
    if (state === 'restore removal')
      await page.route('**/admin/settings/catalogue?*', async (route) => {
        expect(route.request().method()).toBe('GET');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const current = ScopedSettingsReadResponse.parse(await response.json());
        expect(current.target).toEqual({ scope: 'event' });
        const fixture = ScopedSettingsReadResponse.parse({
          ...current,
          data: current.data.map((row) =>
            row.key === 'silentStationMinutes'
              ? { ...row, value: 20, source: { scope: 'event', version: 3 }, storedVersion: 3 }
              : row,
          ),
        });
        await route.fulfill({
          status: 200,
          headers: { 'cache-control': 'no-store' },
          json: fixture,
        });
      });
    await page.route('**/admin/settings/catalogue/history?*', async (route) => {
      expect(route.request().method()).toBe('GET');
      const url = new URL(route.request().url());
      expect(url.searchParams.get('scope')).toBe('event');
      expect(url.searchParams.get('key')).toBe('silentStationMinutes');
      const response = ScopedSettingsHistoryResponse.parse({
        eventId: decodeURIComponent(url.pathname.split('/')[4]!),
        target: { scope: 'event' },
        key: 'silentStationMinutes',
        eventStatus: 'REHEARSAL',
        evaluatedAt: '2026-09-28T02:00:00.000Z',
        data: [
          {
            id: 'visual-threshold-reset',
            key: 'silentStationMinutes',
            version: 2,
            source: 'RESET',
            createdAt: '2026-09-28T01:30:00.000Z',
            createdByYou: true,
            reason: 'Remove the event override after rehearsal',
            values: { available: true, operation: 'reset', before: 20 },
          },
          {
            id: 'visual-threshold-set',
            key: 'silentStationMinutes',
            version: 1,
            source: 'USER',
            createdAt: '2026-09-28T01:00:00.000Z',
            createdByYou: false,
            reason: 'Review a station alert threshold for rehearsal',
            values: { available: true, operation: 'set', before: 15, after: 20 },
          },
        ],
        meta: { count: 2, nextCursor: null },
      });
      await route.fulfill({
        status: 200,
        headers: { 'cache-control': 'no-store' },
        json: response,
      });
    });
    await page.clock.setFixedTime(new Date('2026-09-28T02:00:00.000Z'));
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('chief@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Settings catalogue', exact: true }).click();
    await expect(page.getByRole('button', { name: /^View history:/ })).toHaveCount(14);
    if (state === 'station values') {
      const selector = page.getByLabel('Catalogue scope');
      await expect(selector.locator('option')).not.toHaveCount(1);
      await selector.selectOption((await selector.locator('option').nth(1).getAttribute('value'))!);
      await expect(page.getByRole('button', { name: /^View history:/ })).toHaveCount(3);
    } else if (state === 'history' || state === 'restore value' || state === 'restore removal') {
      await page.getByRole('button', { name: 'View history: Silent station', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'History: Silent station', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Override removed. The inherited value at that time is not recorded.'),
      ).toBeVisible();
      if (state !== 'history') {
        await page
          .getByRole('button', {
            name: `Review catalogue version ${state === 'restore value' ? 1 : 2}`,
            exact: true,
          })
          .click();
        await page
          .getByLabel('Reason for catalogue restore')
          .fill('Restore the reviewed operational setting');
        await page
          .getByRole('group', { name: 'Review catalogue restore' })
          .getByRole('checkbox')
          .check();
        await expect(
          page.getByRole('button', { name: 'Restore catalogue setting', exact: true }),
        ).toBeEnabled();
      }
    }
    await page.waitForLoadState('networkidle');
    const panel = page.locator('#operational-catalogue');
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error('Visible catalogue panel and viewport required');
    await page.setViewportSize({
      width: viewport.width,
      height: Math.max(viewport.height, Math.ceil(bounds.height) + 160),
    });
    await page.getByRole('navigation', { name: 'Main sections' }).evaluate((node) => {
      (node as HTMLElement).style.visibility = 'hidden';
    });
    await page.locator('.sticky.top-0').evaluateAll((nodes) =>
      nodes.forEach((node) => {
        (node as HTMLElement).style.visibility = 'hidden';
      }),
    );
    await expect(panel).toHaveScreenshot(`catalogue-${state.replaceAll(' ', '-')}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    expect(writes).toEqual([]);
    expect(violations).toEqual([]);
  });
}
