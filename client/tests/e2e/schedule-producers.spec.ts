import { ScheduleMutationResponse, zonedWallTime } from '@spoh/shared';
import { expect, test, type Page } from '@playwright/test';

/**
 * P10.8: a report snapshot scheduled from the Schedule screen, seen pending in the timeline,
 * then cancelled there. The fixture is the rehearsal browser database (client/tests/visual).
 */
async function signIn(page: Page) {
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local schedule browser database required');
  const meRequest = page.waitForRequest(
    (request) => request.url().endsWith('/me') && !!request.headers().authorization,
  );
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill('admin@spoh2027.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/home');
  const base = (await meRequest).url().slice(0, -3);
  if (new URL(base).port !== '4012') throw new Error('Local fixture API required');
  return base;
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test.describe(name, () => {
    test.use({ isMobile: name === 'phone', hasTouch: name === 'phone', viewport: { width, height } });

    test('schedules a report snapshot and cancels it from the timeline', async ({ page }) => {
      const base = await signIn(page);
      const errors: string[] = [];
      page.on('pageerror', () => errors.push('APP_PAGE_ERROR'));
      await page.goto(page.url().replace(/\/home$/, '/admin/schedule'));
      const day = page.getByLabel('Day to report on');
      await expect(day.locator('option').nth(1)).toBeAttached();
      await day.selectOption({ index: 1 });
      const tomorrow = zonedWallTime(new Date(Date.now() + 86_400_000), 'Asia/Singapore');
      await page.getByLabel(/^Take the snapshot at/).fill(tomorrow);
      const created = page.waitForResponse(
        (response) => response.url() === `${base}/schedules/reports` && response.status() === 201,
      );
      await page.getByRole('button', { name: 'Schedule report snapshot' }).click();
      const { schedule } = ScheduleMutationResponse.parse(await (await created).json());
      await expect(page.getByText(/^Scheduled\./)).toBeVisible();

      await page.getByRole('button', { name: 'Scheduled work', exact: true }).click();
      const results = page.getByRole('list', { name: 'Scheduled work results' });
      await expect(results.getByText('Report snapshot').first()).toBeVisible();
      const cancelled = page.waitForResponse(
        (response) =>
          response.url() === `${base}/schedules/${schedule.id}/cancel` && response.status() === 200,
      );
      await results.getByRole('button', { name: 'Cancel this schedule' }).first().click();
      await cancelled;
      await page.getByLabel('Schedule status').selectOption('CANCELLED');
      await expect(results.getByText('Cancelled').first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
