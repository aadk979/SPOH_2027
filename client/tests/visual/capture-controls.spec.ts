import { expect, test } from '@playwright/test';
import { primeVisualAccounts } from './primeAccounts';

test.beforeAll(async ({ request }) => primeVisualAccounts(request));

for (const state of ['values', 'review'] as const) {
  test(`capture controls ${state}`, async ({ page }) => {
    const failures: number[] = [];
    const writes: string[] = [];
    const violations: string[] = [];
    await page.exposeBinding('__captureVisualCsp', (_source, directive: string) =>
      violations.push(directive),
    );
    await page.addInitScript(() => {
      addEventListener('securitypolicyviolation', (event) => {
        void (
          globalThis as unknown as { __captureVisualCsp: (directive: string) => void }
        ).__captureVisualCsp(event.effectiveDirective);
      });
    });
    page.on('response', (response) => {
      if (response.status() === 429 || response.status() >= 500) failures.push(response.status());
    });
    page.on('request', (request) => {
      if (request.url().includes('/admin/settings/catalogue') && request.method() === 'POST')
        writes.push(request.method());
    });
    await page.clock.setFixedTime(new Date('2026-09-28T02:00:00.000Z'));
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('chief@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Capture controls', exact: true }).click();
    await expect(page.getByText('Effective capture: Open', { exact: true })).toBeVisible();
    if (state === 'review') {
      await page.getByRole('button', { name: 'Review pause', exact: true }).click();
      await page.getByLabel('Reason for capture change').fill('Review a planned capture pause');
      await expect(page.getByRole('button', { name: 'Apply capture change' })).toBeDisabled();
    }
    await page.waitForLoadState('networkidle');
    expect(failures).toEqual([]);
    expect(writes).toEqual([]);
    const panel = page.locator('#capture-controls');
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error('Visible capture panel and viewport required');
    // Fit the whole panel while retaining the phone/laptop width; avoid off-screen paint clipping.
    await page.setViewportSize({
      width: viewport.width,
      height: Math.max(viewport.height, Math.ceil(bounds.height) + 160),
    });
    // CSS property assignments preserve layout and obey CSP; an injected style tag does not.
    await page.getByRole('navigation', { name: 'Main sections' }).evaluate((node) => {
      (node as HTMLElement).style.visibility = 'hidden';
    });
    await page.locator('.sticky.top-0').evaluateAll((nodes) => {
      nodes.forEach((node) => {
        (node as HTMLElement).style.visibility = 'hidden';
      });
    });
    await expect(panel).toHaveScreenshot(`capture-controls-${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
    expect(violations).toEqual([]);
  });
}
