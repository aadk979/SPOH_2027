import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility (BUILD_PLAN §9.7, §10).
 *
 * Not a compliance exercise. The venue is bright, phones will be dimmed to save
 * battery, and a volunteer reads these screens one-handed while somebody is
 * waiting — the same properties that make a page usable with a screen reader
 * make it usable in a hall at 11am.
 *
 * axe-core is injected from the installed package rather than a CDN, so this
 * runs on a laptop with no network.
 */

// Resolved from the workspace rather than through import.meta: Playwright
// loads spec files as CommonJS, and npm hoists axe-core to the repo root.
const AXE_SOURCE = readFileSync(
  path.resolve(process.cwd(), '../node_modules/axe-core/axe.min.js'),
  'utf8',
);

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
}

async function analyse(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: AXE_SOURCE });

  const results = await page.evaluate(async () => {
    // @ts-expect-error injected at runtime by addScriptTag
    return (await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    })) as { violations: AxeViolation[] };
  });

  return results.violations;
}

function describe(violations: AxeViolation[]): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(' '))
          .slice(0, 3)
          .join('\n  ')}`,
    )
    .join('\n\n');
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

/**
 * Navigate by tapping. The access token lives in memory rather than
 * localStorage (BUILD_PLAN §6.4), so a `page.goto` would drop the session and
 * land on sign-in instead of the screen under test.
 */
async function tapThrough(page: Page, linkName: RegExp, expectedPath: string): Promise<void> {
  await page.getByRole('link', { name: linkName }).click();
  await page.waitForURL(`**${expectedPath}`);
}

test.describe('accessibility', () => {
  test('sign-in has no violations', async ({ page }) => {
    await page.goto('/sign-in');

    const violations = await analyse(page);
    expect(violations, describe(violations)).toEqual([]);
  });

  test('home has no violations', async ({ page }) => {
    await signIn(page, 'booth@spoh2027.test');

    const violations = await analyse(page);
    expect(violations, describe(violations)).toEqual([]);
  });

  test('the registration screen has no violations', async ({ page }) => {
    await signIn(page, 'booth@spoh2027.test');
    await tapThrough(page, /Register a visitor/, '/capture/registration');

    const violations = await analyse(page);
    expect(violations, describe(violations)).toEqual([]);
  });

  test('the counter screen has no violations', async ({ page }) => {
    await signIn(page, 'counter@spoh2027.test');
    await tapThrough(page, /Count entries/, '/capture/footfall');

    const violations = await analyse(page);
    expect(violations, describe(violations)).toEqual([]);
  });

  test('every capture button meets the minimum target size', async ({ page }) => {
    await signIn(page, 'booth@spoh2027.test');
    await tapThrough(page, /Register a visitor/, '/capture/registration');

    // 88px, not the 44px WCAG floor. A booth volunteer taps these hundreds of
    // times an hour without looking, and a missed tap is a visitor who never
    // gets counted (BUILD_PLAN §9.4).
    const buttons = page.locator('.capture-target');
    const count = await buttons.count();
    expect(count).toBe(8);

    for (let index = 0; index < count; index += 1) {
      const box = await buttons.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(88);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(88);
    }
  });

  test('status is never carried by colour alone', async ({ page }) => {
    await signIn(page, 'booth@spoh2027.test');
    await tapThrough(page, /Register a visitor/, '/capture/registration');

    // The sync indicator is the one thing on this screen that changes state,
    // and it must read as words to somebody who cannot see the colour.
    await expect(page.getByText(/All synced|unsynced|failed/)).toBeVisible();
  });
});
