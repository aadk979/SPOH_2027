import { expect, test } from '@playwright/test';

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`report inclusion and labelled CSV on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('chief@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/e/spoh2027/reports');
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeVisible();
    await expect(page.getByText('Rehearsal data is excluded.', { exact: true })).toBeVisible();
    const response = page.waitForResponse((result) =>
      result.url().includes('/reports/summary?includeRehearsal=true'),
    );
    await page.getByRole('checkbox', { name: 'Show rehearsal data' }).check();
    expect((await (await response).json()).rehearsalIncluded).toBe(true);
    await expect(page.getByText('Includes rehearsal data', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download CSV' }).click();
    expect((await download).suggestedFilename()).toContain('-with-rehearsal.csv');
    // The live query may already be cached; its rendered totals must still switch back.
    await page.getByRole('checkbox', { name: 'Show rehearsal data' }).uncheck();
    await expect(page.getByText('Rehearsal data is excluded.', { exact: true })).toBeVisible();
  });
}
