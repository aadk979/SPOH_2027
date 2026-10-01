import { expect, test } from '@playwright/test';

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  for (const route of ['chief', 'ic', 'tv']) {
    test(`${route} rehearsal inclusion on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('chief@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      await page.goto(`/e/spoh2027/${route}`);
      if (route === 'ic')
        await page.getByRole('combobox', { name: 'Station' }).selectOption({ index: 1 });
      const checkbox = page.getByRole('checkbox', { name: 'Show rehearsal data' });
      await expect(checkbox).not.toBeChecked();
      await expect(page.getByText('Rehearsal data is excluded.', { exact: true })).toBeVisible();
      const response = page.waitForResponse(
        (result) =>
          result.url().includes('/dashboard/') && result.url().includes('includeRehearsal=true'),
      );
      await checkbox.check();
      expect((await (await response).json()).rehearsalIncluded).toBe(true);
      await expect(page.getByText('Includes rehearsal data', { exact: true })).toBeVisible();
      if (route === 'tv')
        await expect(
          page.getByText('Rehearsal data included · counts contain practice captures', {
            exact: true,
          }),
        ).toBeVisible();
      if (route === 'chief')
        await expect(
          page.getByText('Mission Complete Badge · practice', { exact: true }),
        ).toBeVisible();
      await checkbox.uncheck();
      await expect(page.getByText('Rehearsal data is excluded.', { exact: true })).toBeVisible();
    });
  }
}
