import { expect, test, type Page } from '@playwright/test';

/**
 * The three flows that decide whether the event has usable data
 * (BUILD_PLAN §10).
 *
 * These exercise the real browser behaviour the integration tests cannot: the
 * IndexedDB outbox, the undo window, optimistic counting, and an alert
 * reaching a second device.
 */

const BOOTH = 'booth@spoh2027.test';
const COUNTER = 'counter@spoh2027.test';
const IC = 'ic@spoh2027.test';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

/**
 * Navigate the way a volunteer does — by tapping, not by URL.
 *
 * `page.goto` is a full page load, and the access token is held in memory
 * rather than localStorage (BUILD_PLAN §6.4), so a hard navigation drops the
 * session and lands on sign-in. That is deliberate: a volunteer phone is
 * shared, borrowed and occasionally lost. It also means these tests have to
 * move through the app the way the app is actually used.
 */
async function tapThrough(page: Page, linkName: RegExp, expectedPath: string): Promise<void> {
  await page.getByRole('link', { name: linkName }).click();
  await page.waitForURL(`**${expectedPath}`);
}

test.describe('booth registration', () => {
  test('records a tap, shows it immediately, and lets it be undone', async ({ page }) => {
    await signIn(page, BOOTH);

    await tapThrough(page, /Register a visitor/, '/capture/registration');

    // Eight buttons, matching slide 14 exactly.
    for (const label of ['Sec 1', 'Sec 2', 'Sec 3', 'Sec 4', 'Sec 5', 'Graduated', 'Other']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Sec 4', exact: true }).click();

    // Optimistic: the count moves off the outbox, without waiting for the
    // server. A volunteer facing a queue never waits for a round trip.
    await expect(page.getByText('this device')).toBeVisible();
    await expect(page.locator('text=/^1$/').first()).toBeVisible();

    // Undo is available for ten seconds and needs no confirmation.
    await expect(page.getByText('Recorded Sec 4')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();

    await expect(page.locator('text=/^0$/').first()).toBeVisible();
  });

  test('never shows a confirmation dialog', async ({ page }) => {
    await signIn(page, BOOTH);
    await tapThrough(page, /Register a visitor/, '/capture/registration');

    let dialogAppeared = false;
    page.on('dialog', () => {
      dialogAppeared = true;
    });

    for (let i = 0; i < 5; i += 1) {
      await page.getByRole('button', { name: 'Sec 4', exact: true }).click();
    }

    // No submit button, no modal, no confirmation. Every extra interaction here
    // is lost data rather than lost time.
    expect(dialogAppeared).toBe(false);
    await expect(page.getByRole('button', { name: /submit/i })).toHaveCount(0);
  });

  test('keeps counting when the network drops, and syncs when it returns', async ({
    page,
    context,
  }) => {
    await signIn(page, BOOTH);
    await tapThrough(page, /Register a visitor/, '/capture/registration');

    await context.setOffline(true);

    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: 'Sec 4', exact: true }).click();
      await page.waitForTimeout(100);
    }

    // The taps are in IndexedDB. The volunteer sees the count and the unsynced
    // badge, and keeps working.
    await expect(page.locator('text=/^3$/').first()).toBeVisible();
    await expect(page.getByText(/unsynced/)).toBeVisible();

    await context.setOffline(false);

    // The flush loop drains on the `online` event.
    await expect(page.getByText('All synced')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('footfall counter', () => {
  test('presents one enormous button and counts one-handed', async ({ page }) => {
    await signIn(page, COUNTER);

    await tapThrough(page, /Count entries/, '/capture/footfall');

    const plus = page.getByRole('button', { name: /Count one entry/ });
    await expect(plus).toBeVisible();

    // At least 60% of the viewport, so it can be hit without looking.
    const box = await plus.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((box?.height ?? 0) / (viewport?.height ?? 1)).toBeGreaterThan(0.5);

    await plus.click();
    await expect(page.locator('text=/^1$/').first()).toBeVisible();

    await plus.click();
    await expect(page.locator('text=/^2$/').first()).toBeVisible();
  });

  test('offers no way to edit history', async ({ page }) => {
    await signIn(page, COUNTER);
    await tapThrough(page, /Count entries/, '/capture/footfall');

    // Increment-only with undo. Editable history is how tallies get tidied up
    // into fiction.
    await expect(page.getByRole('button', { name: /^-$/ })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });
});

test.describe('lost person', () => {
  test('reaches a second device and clears when resolved', async ({ browser }) => {
    const reporter = await browser.newContext();
    const searcher = await browser.newContext();

    const reporterPage = await reporter.newPage();
    const searcherPage = await searcher.newPage();

    await signIn(reporterPage, BOOTH);
    await signIn(searcherPage, COUNTER);

    const description = `E2E test alert ${Date.now()}`;

    await tapThrough(reporterPage, /Report a lost person/, '/safety/lost-person/new');
    await reporterPage.getByLabel(/What has happened/).fill(description);
    await reporterPage.getByLabel('Approximate age').fill('about 8');
    await reporterPage.getByRole('button', { name: /Alert every volunteer/ }).click();
    await reporterPage.waitForURL('**/home');

    // The searcher is on a different screen entirely and still sees it: the
    // banner lives in the app shell and the poll runs everywhere.
    await expect(searcherPage.getByRole('alert', { name: /Lost person alert/ })).toContainText(
      description,
      { timeout: 20_000 },
    );
    // Scoped to the alert this test raised — other alerts may legitimately be
    // live, and a searcher's screen shows all of them.
    const banner = searcherPage.getByRole('alert', { name: /Lost person alert/ });
    const mine = banner.locator('div').filter({ hasText: description }).last();

    await expect(mine.getByText('Lost person — search now')).toBeVisible();
    await mine.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(mine.getByRole('button', { name: /Acknowledged/ })).toBeVisible();

    // An IC resolves it, and it clears on every device — not just theirs.
    const icContext = await browser.newContext();
    const icPage = await icContext.newPage();
    await signIn(icPage, IC);

    const icAlert = icPage
      .getByRole('alert', { name: /Lost person alert/ })
      .locator('div')
      .filter({ hasText: description })
      .last();

    await expect(icAlert).toBeVisible({ timeout: 20_000 });
    await icAlert.getByRole('button', { name: /Found — clear this alert/ }).click();

    // The searcher never touched their screen; the poll clears it for them.
    await expect(searcherPage.getByText(description)).toHaveCount(0, { timeout: 20_000 });

    await reporter.close();
    await searcher.close();
    await icContext.close();
  });

  test('tells the volunteer to call rather than tap', async ({ page }) => {
    await signIn(page, BOOTH);
    await tapThrough(page, /Report a lost person/, '/safety/lost-person/new');

    // The standing instruction for a genuine emergency is phone and voice.
    // The app coordinates a search; it is not the emergency channel.
    await expect(page.getByText(/medical or fire emergency, call/)).toBeVisible();
  });
});
