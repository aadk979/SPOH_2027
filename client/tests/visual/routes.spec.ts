import { expect, test } from '@playwright/test';
import { primeVisualAccounts } from './primeAccounts';

// Every app page appears here, including the root redirect. Accounts come from
// the disposable visual seed; capture screens use a posted volunteer.
const routes = [
  '/',
  '/home',
  '/attendance',
  '/brief',
  '/guide',
  '/tv',
  '/operations',
  '/inbox',
  '/chief',
  '/safety',
  '/map',
  '/ic',
  '/sign-in',
  '/admin/users',
  '/admin/settings',
  '/chief/imports',
  '/journey',
  '/shift',
  '/chief/fallback',
  '/reports',
  '/safety/lost-person/new',
  '/safety/lost-found',
  '/safety/lost-found/new',
  '/safety/incident/new',
  '/capture/stamp',
  '/capture/footfall',
  '/capture/redeem',
  '/capture/registration',
  '/capture/registration/group',
];

// Check seeded identities before the spec. UI sessions touch event-membership
// lastSeenAt; use the existing chief account for additional settings visual states.
test.beforeAll(async ({ request }) => primeVisualAccounts(request));
for (const route of routes) {
  test(route, async ({ page }) => {
    const serverFailures: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 429 || response.status() >= 500) {
        serverFailures.push(response.status() + ' ' + response.url());
      }
    });
    await page.clock.setFixedTime(new Date('2026-09-28T02:00:00.000Z'));
    if (route !== '/sign-in') {
      const email =
        route === '/capture/footfall' || route === '/capture/stamp'
          ? 'counter@spoh2027.test'
          : route.startsWith('/capture/')
            ? 'booth@spoh2027.test'
            : route === '/ic'
              ? 'ic@spoh2027.test'
              : 'chief@spoh2027.test';
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill(email);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
    }
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
    expect(serverFailures).toEqual([]);
    if (route !== '/sign-in') await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).toHaveScreenshot(
      `${route === '/' ? 'root' : route.slice(1).replaceAll('/', '-')}.png`,
      {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      },
    );
  });
}
