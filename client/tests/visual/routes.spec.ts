import { expect, test } from '@playwright/test';

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

// Sign-in updates lastSeenAt. Prime every seeded account before either viewport
// captures the roster, so test order cannot change its "never signed in" rows.
test.beforeAll(async ({ request }) => {
  const apiBase = process.env.VISUAL_API_URL ?? 'http://localhost:4012';
  for (const name of ['admin', 'lead', 'chief', 'dc', 'ic', 'booth', 'counter']) {
    const response = await request.post(`${apiBase}/api/v1/dev-auth/sign-in`, {
      data: { email: `${name}@spoh2027.test` },
    });
    expect(response.ok()).toBe(true);
  }
});
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
