import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { RecordsFilter } from '@spoh/shared';
import { entityPath, recordsPath } from '@/shared/lib/workspacePath';
import { BROWSER_PROJECTS, WORKSPACE_ENTITY_CASES, WORKSPACE_RECORD_CASES } from '../browser/routeManifest';
import { installWorkspaceFixture, workspaceFixtureState, WORKSPACE_EVENT } from '../browser/workspaceFixtures';

const axe = readFileSync('../node_modules/axe-core/axe.min.js', 'utf8');
async function verifyViewportAndAccess(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(axe);
  const violations = await page.evaluate(async () => {
    const runtime = window as unknown as { axe: typeof import('axe-core') };
    return (await runtime.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      .violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => violation.id);
  });
  expect(violations).toEqual([]);
}
const eventPath = (path: string) => `/e/${WORKSPACE_EVENT.slug}${path}`;

for (const project of BROWSER_PROJECTS) {
  test.describe(project.name, () => {
    test.use({ viewport: project.viewport, colorScheme: project.colorScheme, deviceScaleFactor: 1,
      isMobile: project.name.startsWith('phone'), hasTouch: project.name.startsWith('phone'),
      serviceWorkers: 'block', locale: 'en-SG', timezoneId: 'Asia/Singapore', contextOptions: { reducedMotion: 'reduce' } });

    for (const kind of WORKSPACE_ENTITY_CASES) {
      test(`scoped ${kind} entity has safe fields, denied facets and exact related records`, async ({ page }) => {
        const state = workspaceFixtureState(); state.entityKind = kind;
        await installWorkspaceFixture(page, state);
        const destination = eventPath(entityPath({ kind, id: 'workspace-record' }));
        await page.goto(destination);
        await expect(page.getByRole('heading', { name: `Synthetic ${kind} record`, exact: true })).toBeVisible();
        await expect(page).toHaveURL(destination);
        await expect(page.getByText('This station roster is outside your current access.', { exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Exact room entries' })).toHaveAttribute('href',
          eventPath('/records?kind=footfall&stationId=workspace-station&asOf=2027-01-08T02%3A00%3A00.000Z&includeRehearsal=false'));
        await verifyViewportAndAccess(page);
        await expect(page).toHaveScreenshot(`workspace-${project.name}-entity-${kind}.png`, { fullPage: true, animations: 'disabled', caret: 'hide' });
        expect(state.unexpected).toEqual([]);
      });
    }

    for (const kind of WORKSPACE_RECORD_CASES) {
      test(`${kind} records show the aggregate, row count, observation and keyset page`, async ({ page }) => {
        const state = workspaceFixtureState(); state.recordsKind = kind;
        await installWorkspaceFixture(page, state);
        const filter = RecordsFilter.parse(kind === 'gift-ledger' ? { kind, giftTypeId: 'workspace-gift', rehearsal: false } : { kind });
        const destination = eventPath(recordsPath(filter));
        await page.goto(destination);
        await expect(page.getByRole('heading', { name: 'Synthetic current record', exact: true })).toBeVisible();
        await expect(page).toHaveURL(destination);
        await expect(page.getByText('2 records match these filters. 1 shown.', { exact: true })).toBeVisible();
        if (kind === 'footfall') await expect(page.getByText('241 room entries', { exact: true })).toBeVisible();
        if (kind === 'gift-ledger') await expect(page.getByText('Pool balance: 78', { exact: true })).toBeVisible();
        await page.getByText('Applied filters and observation', { exact: true }).click();
        await expect(page.getByText('2027-01-08T02:00:00.000Z').first()).toBeVisible();
        await page.getByRole('button', { name: 'Load older records', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Synthetic older record', exact: true })).toBeVisible();
        await expect(page.getByText('2 records match these filters. 2 shown.', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Load older records', exact: true })).toHaveCount(0);
        await verifyViewportAndAccess(page);
        await expect(page).toHaveScreenshot(`workspace-${project.name}-records-${kind}.png`, { fullPage: true, animations: 'disabled', caret: 'hide' });
        expect(state.unexpected).toEqual([]);
      });
    }

    test('tools/search are keyboard reachable; Escape restores focus, and help explains count units', async ({ page }) => {
      const state = await installWorkspaceFixture(page);
      await page.goto(eventPath('/search'));
      await expect(page.getByText('Find an event record', { exact: true })).toBeVisible();
      const tools = page.getByRole('button', { name: 'Tools', exact: true });
      await tools.focus(); await page.keyboard.press('ControlOrMeta+k');
      const dialog = page.getByRole('dialog', { name: 'Tools and search' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(tools).toBeFocused();
      await tools.press('Enter'); await page.keyboard.press('Tab');
      await expect(dialog.getByLabel('Search this event', { exact: true })).toBeFocused();
      await dialog.getByLabel('Search this event', { exact: true }).fill('Gallery'); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(eventPath('/search?query=Gallery'));
      await expect(page.getByRole('link', { name: 'Synthetic Gallery' })).toBeVisible();
      await page.getByRole('link', { name: 'Synthetic Gallery' }).click();
      await expect(page.getByRole('heading', { name: 'Synthetic station record', exact: true })).toBeVisible();
      await tools.click(); await dialog.getByRole('link', { name: 'Help and count glossary', exact: true }).click();
      await expect(page).toHaveURL(eventPath('/help'));
      await expect(page.getByRole('heading', { name: 'Help and count glossary', exact: true })).toBeVisible();
      await verifyViewportAndAccess(page);
      expect(state.unexpected).toEqual([]);
    });

    test('empty, denied, missing and unavailable states do not retain the previous private body', async ({ page }) => {
      const state = await installWorkspaceFixture(page);
      const destination = eventPath(entityPath({ kind: 'station', id: 'workspace-record' }));
      await page.goto(destination);
      await expect(page.getByRole('heading', { name: 'Synthetic station record', exact: true })).toBeVisible();
      for (const status of [503, 403, 404]) {
        state.status = status;
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(page.getByText('workspace-browser-request', { exact: true })).toBeVisible();
        await expect(page.getByText('CasePreserved', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Synthetic station record', exact: true })).toHaveCount(0);
        if (status === 503) {
          state.status = 200;
          await page.getByRole('button', { name: 'Retry loading this record', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Synthetic station record', exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: /Retry/ })).toHaveCount(0);
          state.status = 200; await page.reload();
          await expect(page.getByRole('heading', { name: 'Synthetic station record', exact: true })).toBeVisible();
        }
      }
      state.empty = true; state.recordsKind = 'footfall';
      await page.goto(eventPath(recordsPath({ kind: 'footfall' })));
      await expect(page.getByText('No matching records', { exact: true })).toBeVisible();
      await expect(page.getByText('0 records match these filters. 0 shown.', { exact: true })).toBeVisible();
      await verifyViewportAndAccess(page);
      expect(state.unexpected).toEqual([]);
    });
  });
}
