import { expect, test } from '@playwright/test';
import { CaptureScheduleListResponse, type CaptureScheduleRecord } from '@spoh/shared';
import { primeVisualAccounts } from './primeAccounts';

test.beforeAll(async ({ request }) => primeVisualAccounts(request));
function visualSchedules(eventId: string): CaptureScheduleRecord[] {
  const own: CaptureScheduleRecord = {
    id: 'visual-owned-capture',
    eventId,
    target: { scope: 'event' },
    key: 'capture.open',
    value: false,
    expectedVersion: 0,
    reason: 'Planned capture pause for a reviewed handover',
    kind: 'SETTING',
    recurring: false,
    createdByYou: true,
    status: 'PENDING',
    version: 7,
    attempts: 0,
    maxAttempts: 5,
    createdAt: '2026-09-28T01:00:00.000Z',
    runAt: '2026-09-28T02:05:00.000Z',
    scheduledFor: '2026-09-28T02:05:00.000Z',
    completedAt: null,
    lastError: null,
  };
  return [
    own,
    {
      ...own,
      id: 'visual-other-capture',
      createdByYou: false,
      value: true,
      version: 2,
      reason: 'Another manager reviewed this capture opening',
    },
    {
      ...own,
      id: 'visual-failed-capture',
      status: 'FAILED',
      completedAt: '2026-09-28T01:30:00.000Z',
      attempts: 1,
      lastError: 'GUARD_FAILED',
      reason: 'An earlier capture change invalidated the reviewed version',
    },
  ];
}
for (const state of ['list', 'create', 'edit', 'cancel'] as const) {
  test(`capture schedules ${state}`, async ({ page }) => {
    const failures: number[] = [],
      writes: string[] = [],
      errors: string[] = [],
      violations: string[] = [];
    page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
    page.on('response', (response) => {
      if (response.status() === 429 || response.status() >= 500) failures.push(response.status());
    });
    page.on('request', (request) => {
      if (
        request.url().includes('/admin/settings/catalogue') &&
        ['POST', 'PATCH'].includes(request.method())
      )
        writes.push(request.method());
    });
    await page.exposeBinding('__captureScheduleVisualCsp', (_source, directive: string) =>
      violations.push(directive),
    );
    await page.addInitScript(() => {
      addEventListener(
        'securitypolicyviolation',
        (event) =>
          void (
            globalThis as unknown as { __captureScheduleVisualCsp: (directive: string) => void }
          ).__captureScheduleVisualCsp(event.effectiveDirective),
      );
    });
    // Typed read-only visual rows exercise all form states without changing frozen database fixtures.
    await page.route('**/admin/settings/catalogue/schedules?*', async (route) => {
      expect(route.request().method()).toBe('GET');
      const url = new URL(route.request().url());
      const eventId = decodeURIComponent(url.pathname.split('/')[4]!);
      const rows = state === 'create' ? [] : visualSchedules(eventId);
      const response = CaptureScheduleListResponse.parse({
        eventId,
        target: { scope: 'event' },
        key: 'capture.open',
        evaluatedAt: '2026-09-28T02:00:00.000Z',
        data: rows,
        meta: { count: rows.length, nextCursor: null },
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
    await page.getByRole('button', { name: 'Capture controls', exact: true }).click();
    await expect(page.getByText('Effective capture: Open', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Capture schedules', exact: true }).click();
    if (state === 'create')
      await page.getByRole('button', { name: 'Review future capture change' }).click();
    else if (state === 'edit')
      await page
        .getByRole('group', { name: 'Paused capture schedule' })
        .filter({ hasText: 'Planned capture pause' })
        .getByRole('button', { name: 'Edit capture schedule' })
        .click();
    else if (state === 'cancel')
      await page
        .getByRole('group', { name: 'Open capture schedule' })
        .getByRole('button', { name: 'Cancel capture schedule' })
        .click();
    if (state !== 'list') {
      await page
        .getByLabel('Reason for capture schedule')
        .fill('Review the planned capture schedule');
      await expect(page.getByRole('button', { name: 'Confirm capture schedule' })).toBeDisabled();
    }
    await page.waitForLoadState('networkidle');
    const panel = page.locator('#capture-controls');
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error('Visible capture panel and viewport required');
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
    await expect(panel).toHaveScreenshot(`capture-schedules-${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
    expect(failures).toEqual([]);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });
}
