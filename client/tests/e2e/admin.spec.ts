import { expect, test, type Page } from '@playwright/test';

/**
 * Roster administration, and the session surviving a reload.
 *
 * Two things here that only a real browser can prove:
 *
 *  1. A Chief can find and use the roster screen. The capability matrix is
 *     covered exhaustively by the integration suite; what it cannot tell us is
 *     whether the tile is reachable from where somebody actually starts.
 *
 *  2. A hard reload keeps the volunteer signed in. The access token lives in
 *     memory and always will; what changed is that the refresh cookie now
 *     recovers it. That is a browser behaviour — httpOnly, path scoping and a
 *     cookie surviving a navigation — so it cannot be tested anywhere else.
 */

const CHIEF = 'chief@spoh2027.test';
const BOOTH = 'booth@spoh2027.test';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  // Against `next dev` the form is visible before React has attached its
  // submit handler; a click in that window submits natively and reloads the
  // page. Wait for the session bootstrap call, which only runs once hydrated.
  await page.waitForResponse((response) => response.url().includes('/api/v1/auth/refresh'));
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

test.describe('the session survives a reload', () => {
  /**
   * This is what the refresh cookie bought. Before it, a reload dropped the
   * in-memory token and bounced the volunteer to sign-in — on a phone that had
   * been in a pocket, that was every time.
   */
  test('a hard reload lands back on the app, not on sign-in', async ({ page }) => {
    await signIn(page, BOOTH);

    await page.reload();

    await expect(page).toHaveURL(/\/home/);
    await expect(page.getByRole('heading', { name: /Hello,/ }).first()).toBeVisible();
  });

  test('signing out survives a reload too, in the other direction', async ({ page }) => {
    await signIn(page, BOOTH);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');

    // The cookie is cleared server-side, so the reload must not silently
    // restore a session on a phone that has just been handed to somebody else.
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('roster administration', () => {
  test('a Chief reaches the roster from the home screen and can act on it', async ({ page }) => {
    await signIn(page, CHIEF);
    await page
      .getByRole('navigation', { name: 'Main sections' })
      .getByRole('link', { name: 'Operations', exact: true })
      .click();

    await page.getByRole('link', { name: /Volunteers/ }).click();
    await page.waitForURL('**/admin/users');

    // The list itself. Exact, because the section heading below it also
    // contains the word once the count has loaded.
    await expect(page.getByRole('heading', { name: 'Volunteers', exact: true })).toBeVisible();
    await expect(page.getByLabel('Name or email')).toBeVisible();

    // The roster actually arrives — an empty list here would mean the screen
    // works and the data does not, which is the failure worth catching.
    await expect(page.getByRole('heading', { name: /\d+ volunteers?/ })).toBeVisible();

    // Search narrows to one person.
    await page.getByLabel('Name or email').fill('booth@');
    await expect(page.getByText('booth@spoh2027.test')).toBeVisible();

    // And the management controls are there, because this role may use them.
    await page.getByRole('button', { name: 'Manage' }).first().click();
    await expect(page.getByRole('heading', { name: 'Withdraw access' })).toBeVisible();
    await expect(page.getByLabel('Committee role')).toBeVisible();
  });

  /**
   * The server refuses this with ROLE_ESCALATION_DENIED regardless. The point
   * of the screen matching it is that a Chief who fills in a form, presses Save
   * and gets a 403 has been told the app is broken, not that the rule exists.
   */
  test('offers a Chief no controls over an account above their own level', async ({ page }) => {
    await signIn(page, CHIEF);
    await page
      .getByRole('navigation', { name: 'Main sections' })
      .getByRole('link', { name: 'Operations', exact: true })
      .click();

    await page.getByRole('link', { name: /Volunteers/ }).click();
    await page.waitForURL('**/admin/users');

    // Narrows the list to exactly that one Admin, so a page-level assertion is
    // both simpler and stricter than picking the row out of the DOM.
    await page.getByLabel('Name or email').fill('admin@spoh2027.test');
    await expect(page.getByRole('heading', { name: '1 volunteer' })).toBeVisible();

    await expect(page.getByText('Above your level')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage' })).toHaveCount(0);
  });

  test('offers nobody controls over their own account', async ({ page }) => {
    await signIn(page, CHIEF);
    await page
      .getByRole('navigation', { name: 'Main sections' })
      .getByRole('link', { name: 'Operations', exact: true })
      .click();

    await page.getByRole('link', { name: /Volunteers/ }).click();
    await page.waitForURL('**/admin/users');

    await page.getByLabel('Name or email').fill('chief@spoh2027.test');
    await expect(page.getByText('Your account')).toBeVisible();
  });

  test('a booth volunteer has no route to it at all', async ({ page }) => {
    await signIn(page, BOOTH);

    await expect(page.getByRole('link', { name: /Volunteers/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Event settings/ })).toHaveCount(0);
  });

  test('a Chief can read the event settings', async ({ page }) => {
    await signIn(page, CHIEF);
    await page
      .getByRole('navigation', { name: 'Main sections' })
      .getByRole('link', { name: 'Operations', exact: true })
      .click();

    await page.getByRole('link', { name: /Event settings/ }).click();
    await page.waitForURL('**/admin/settings');

    await expect(page.getByRole('heading', { name: 'Shift blocks' })).toBeVisible();

    // The two times that decide whether the capture screens work at all.
    await expect(page.getByLabel('Morning starts')).toHaveValue('09:30');
    await expect(page.getByLabel('Afternoon ends')).toHaveValue('18:00');
  });
});

test.describe('adding people', () => {
  /**
   * The form's default role is Volunteer. Somebody typing an email that is
   * already the Room A IC must be stopped and shown the row, not have the IC
   * silently demoted. Non-mutating, so it is safe against the seeded database.
   */
  test('adding an existing email points the Chief at the existing row', async ({ page }) => {
    await signIn(page, CHIEF);
    await page.goto('/admin/users');

    await page.getByRole('button', { name: 'Add a volunteer' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Somebody New');
    await page.getByLabel('Email', { exact: true }).fill(BOOTH);
    await page.getByRole('button', { name: 'Add and send the invite' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Already on the roster' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Show their row' }).click();

    await expect(page.getByLabel('Name or email')).toHaveValue(BOOTH);
    await expect(page.getByRole('heading', { name: '1 volunteer' })).toBeVisible();
  });

  /**
   * The import previews before it writes. The template names people who are
   * not on the seeded roster, so the preview reports them as new; nothing is
   * committed, so the seed is untouched for the next run.
   */
  test('the roster import previews a pasted file line by line', async ({ page }) => {
    await signIn(page, CHIEF);
    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'Import a file' }).click();
    await page.waitForURL('**/admin/users/import');

    // A paste the way Excel produces it: tabs, a friendlier header, a
    // Singapore date and a role abbreviation — plus one broken line.
    await page
      .getByLabel(/paste rows/)
      .fill(
        [
          'Full Name\tEmail\tRole\tStation\tDate\tShift',
          'E2E Import One\te2e-one@spoh2027.test\tIC\tSIGNUP_BOOTH\t7/1/2027\tAM',
          'E2E Import Two\te2e-two@spoh2027.test\t\tSIGNUP_BOOTH\t7/1/2027\tPM',
          'E2E Broken\tnot-an-email\t\t\t\t',
        ].join('\n'),
      );

    await expect(page.getByText('3 rows read, 2 ready, 1 left out.')).toBeVisible();
    await expect(page.getByText(/Line 4/)).toBeVisible();

    await page.getByRole('button', { name: 'Preview 2 rows — writes nothing' }).click();

    await expect(page.getByRole('heading', { name: 'This is what would happen' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Import: add 2 people, 2 shifts/ }),
    ).toBeVisible();

    // Neither person exists afterwards: the preview wrote nothing.
    await page.goto('/admin/users');
    await page.getByLabel('Name or email').fill('e2e-one@');
    await expect(page.getByText('Nobody matches that')).toBeVisible();
  });
});
