import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_ROUTES } from '../browser/routeManifest';
import { installCampaignFixture } from '../browser/campaignFixtures';

const axeSource = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');

async function accessibility(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const runtime = window as unknown as { axe: typeof import('axe-core') };
    return (await runtime.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({ id: violation.id, help: violation.help,
        targets: violation.nodes.map((node) => node.target) }));
  });
  expect(violations).toEqual([]);
}

for (const entry of CAMPAIGN_ROUTES) {
  test(`${entry.scope} ${entry.path}: populated page, accessibility and visual`, async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.clock.setFixedTime(new Date('2027-01-08T02:00:00.000Z'));
    const fixture = await installCampaignFixture(page, entry);
    await page.goto(fixture.url);
    await fixture.ready();
    await expect(page).toHaveURL(new RegExp(`${fixture.expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(page.getByText(/Loading (?:this|these|your)|Permissions could not be checked|Try again shortly/i)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await accessibility(page);
    await expect(page).toHaveScreenshot(`${entry.path === '/' ? 'root' : entry.path.slice(1).replaceAll('/', '-')}.png`,
      { fullPage: true, animations: 'disabled', caret: 'hide' });
    expect(fixture.unexpected).toEqual([]);
    expect(failures).toEqual([]);
  });
}
