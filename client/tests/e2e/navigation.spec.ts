import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');

async function mockSession(page: Page, leader = false, failMe = false) {
  const capabilities = leader ? ['dashboard.event.read', 'user.read'] : ['registration.create'];
  const volunteer = {
    id: 'test-volunteer',
    displayName: 'Alex Tan',
    role: leader ? 'CHIEF' : 'VOLUNTEER',
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me') && failMe) {
      await route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } });
      return;
    }
    const json = path.includes('/auth/')
      ? { accessToken: 'preview', expiresIn: 3600, volunteer, capabilities, refreshAvailable: true }
      : path.endsWith('/me')
        ? {
            volunteer,
            capabilities,
            currentAssignment: null,
            upcomingAssignments: [],
            escalationChain: [],
          }
        : path.endsWith('/lost-person/active')
          ? { alerts: [] }
          : {};
    await route.fulfill({ json });
  });
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`sections are reachable and accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    if (viewport.width === 320) await page.emulateMedia({ colorScheme: 'dark' });
    await mockSession(page, true);
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Hello, Alex Tan' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main sections' });
    for (const [label, path] of [
      ['Guide', '/guide'],
      ['Safety', '/safety'],
      ['Operations', '/operations'],
      ['Home', '/home'],
    ] as const) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(path + '$'));
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.addScriptTag({ content: axe });
      const violations = await page.evaluate(async () => {
        const runtime = window as unknown as { axe: typeof import('axe-core') };
        return (
          await runtime.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
          })
        ).violations;
      });
      expect(violations).toEqual([]);
      await page.screenshot({
        path: `test-results/workspace-${viewport.width}-${label.toLowerCase()}.png`,
        fullPage: true,
      });
    }
    await nav.getByRole('link', { name: 'Guide', exact: true }).click();
    await page.getByRole('link', { name: /What do I say/ }).click();
    await expect(page).toHaveURL(/\/brief$/);
    await expect(nav.getByRole('link', { name: 'Guide', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Guide', exact: true }).last()).toBeVisible();
  });
}

test('a volunteer has no operations tab, and errors leave sections usable', async ({ page }) => {
  await mockSession(page, false, true);
  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible({ timeout: 15000 });
  const nav = page.getByRole('navigation', { name: 'Main sections' });
  await expect(nav.getByRole('link', { name: 'Operations' })).toHaveCount(0);
  await nav.getByRole('link', { name: 'Safety' }).click();
  await page.getByRole('link', { name: /Report a lost person/ }).click();
  await expect(page).toHaveURL(/\/safety\/lost-person\/new$/);
});
