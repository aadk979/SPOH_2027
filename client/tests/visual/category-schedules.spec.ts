import { expect, test } from '@playwright/test';
import {
  CategoryActivityListResponse,
  CategoryActivityResponse,
  CategoryScheduleListResponse,
  type CategoryActivityRecord,
  type CategoryScheduleRecord,
} from '@spoh/shared';
import { primeVisualAccounts } from './primeAccounts';

test.beforeAll(async ({ request }) => primeVisualAccounts(request));
const category: CategoryActivityRecord = {
  id: 'visual-reviewed-category',
  code: 'SEC_4',
  label: 'Sec 4',
  sortOrder: 4,
  active: true,
  updatedAt: '2026-09-28T01:00:00.000Z',
};
const evaluatedAt = '2026-09-28T02:00:00.000Z';
function visualSchedules(eventId: string): CategoryScheduleRecord[] {
  const own: CategoryScheduleRecord = {
    id: 'visual-owned-category',
    eventId,
    categoryId: category.id,
    kind: 'CAPTURE_CATEGORY',
    active: false,
    expectedActive: true,
    expectedUpdatedAt: category.updatedAt,
    reason: 'Planned category handover reviewed by the manager',
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
      id: 'visual-other-category',
      active: true,
      createdByYou: false,
      version: 2,
      reason: 'Another manager scheduled this category activation',
    },
    {
      ...own,
      id: 'visual-refused-category',
      status: 'FAILED',
      completedAt: '2026-09-28T01:30:00.000Z',
      attempts: 1,
      lastError: 'AUTHORITY_CHANGED',
      reason: 'The creator no longer has category management access',
    },
  ];
}

for (const state of ['list', 'create', 'edit', 'cancel'] as const) {
  test(`category schedules ${state}`, async ({ page }) => {
    const failures: number[] = [],
      writes: string[] = [],
      errors: string[] = [],
      violations: string[] = [];
    page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
    page.on('response', (response) => {
      if (response.status() === 429 || response.status() >= 500) failures.push(response.status());
    });
    page.on('request', (request) => {
      if (request.url().includes('/admin/capture-categories') && request.method() !== 'GET')
        writes.push(request.method());
    });
    await page.exposeBinding('__categoryVisualCsp', (_source, directive: string) =>
      violations.push(directive),
    );
    await page.addInitScript(() => {
      addEventListener(
        'securitypolicyviolation',
        (event) =>
          void (
            globalThis as unknown as { __categoryVisualCsp: (directive: string) => void }
          ).__categoryVisualCsp(event.effectiveDirective),
      );
    });
    // Typed private read fixtures exercise forms without mutating the frozen visual database.
    await page.route('**/admin/capture-categories**', async (route) => {
      expect(route.request().method()).toBe('GET');
      const url = new URL(route.request().url());
      const eventId = decodeURIComponent(url.pathname.split('/')[4]!);
      const envelope = { eventId, eventStatus: 'REHEARSAL', evaluatedAt };
      let response: unknown;
      if (url.pathname.endsWith('/capture-categories')) {
        response = CategoryActivityListResponse.parse({
          ...envelope,
          data: [category],
          meta: { count: 1, nextCursor: null },
        });
      } else if (url.pathname.endsWith(`/capture-categories/${category.id}`)) {
        response = CategoryActivityResponse.parse({ ...envelope, data: category });
      } else {
        expect(url.pathname).toContain(`/capture-categories/${category.id}/schedules`);
        const rows = state === 'create' ? [] : visualSchedules(eventId);
        response = CategoryScheduleListResponse.parse({
          eventId,
          categoryId: category.id,
          evaluatedAt,
          data: rows,
          meta: { count: rows.length, nextCursor: null },
        });
      }
      await route.fulfill({
        status: 200,
        headers: { 'cache-control': 'no-store' },
        json: response,
      });
    });
    await page.clock.setFixedTime(new Date(evaluatedAt));
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('chief@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Category schedules', exact: true }).click();
    await page.getByLabel('Capture category').selectOption(category.id);
    if (state === 'create')
      await page.getByRole('button', { name: 'Review future category change' }).click();
    else if (state === 'edit')
      await page
        .getByRole('group', { name: 'Inactive category schedule' })
        .filter({ hasText: 'Planned category handover' })
        .getByRole('button', { name: 'Edit category schedule' })
        .click();
    else if (state === 'cancel')
      await page
        .getByRole('group', { name: 'Active category schedule', exact: true })
        .getByRole('button', { name: 'Cancel category schedule' })
        .click();
    if (state !== 'list') {
      await page
        .getByLabel('Reason for category schedule')
        .fill('Review the planned category change');
      await expect(page.getByRole('button', { name: 'Confirm category schedule' })).toBeDisabled();
    }
    await page.waitForLoadState('networkidle');
    const panel = page.locator('#category-schedules');
    const bounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error('Visible category panel and viewport required');
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
    await expect(panel).toHaveScreenshot(`category-schedules-${state}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });
    expect(failures).toEqual([]);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });
}
