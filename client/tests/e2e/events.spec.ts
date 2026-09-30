import { expect, test, type Page } from '@playwright/test';

/**
 * Two events at once (P09.8, ADR-001 "How it is tested" 5), on the seeded
 * database: "SPOH 2027" and "Dry Run", with one person on both rosters — a
 * volunteer at the Sign-Up Booth in the first, the booth IC in the second.
 * Each event's shifts, stations and roles appear only under its own
 * address, and switching events navigates rather than changing the page.
 */

const MULTI = 'multi@spoh2027.test';
const FIRST = { slug: 'spoh2027', name: 'SPOH 2027', station: 'Sign-Up Booth' };
const SECOND = { slug: 'dry-run', name: 'Dry Run', station: 'Dry-run booth' };

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

function sectionNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main sections' });
}

test('a person on two rosters picks an event, and each shows only its own', async ({ page }) => {
  await signIn(page, MULTI);

  // Two events and none used on this device yet: the picker, not a guess.
  await page.waitForURL('**/events');
  await expect(page.getByRole('link', { name: new RegExp(FIRST.name) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(SECOND.name) }).click();
  await page.waitForURL(`**/e/${SECOND.slug}/home`);

  // In the dry run: its shift at its booth, as its IC.
  await sectionNav(page).getByRole('link', { name: /shift/i }).click();
  await page.waitForURL(`**/e/${SECOND.slug}/shift`);
  await expect(page.getByText(SECOND.station)).toBeVisible();
  await expect(page.getByText(/Booth IC/)).toBeVisible();
  await expect(page.getByText(FIRST.station)).toHaveCount(0);

  // Switching goes to the other event's home; nothing of the dry run follows.
  await page.getByLabel('Event').selectOption({ label: FIRST.name });
  await page.waitForURL(`**/e/${FIRST.slug}/home`);
  await sectionNav(page).getByRole('link', { name: /shift/i }).click();
  await page.waitForURL(`**/e/${FIRST.slug}/shift`);
  await expect(page.getByText(FIRST.station).first()).toBeVisible();
  await expect(page.getByText(/Registration/).first()).toBeVisible();
  await expect(page.getByText(/Booth IC/)).toHaveCount(0);
  await expect(page.getByText(SECOND.station)).toHaveCount(0);
});

test('an old address opens that screen in the event last used on this device', async ({ page }) => {
  await signIn(page, MULTI);
  await page.waitForURL('**/events');
  await page.getByRole('link', { name: new RegExp(SECOND.name) }).click();
  await page.waitForURL(`**/e/${SECOND.slug}/home`);

  // A bookmark or a notification from before event addresses (ADR-009 §6).
  await page.goto('/shift');
  await page.waitForURL(`**/e/${SECOND.slug}/shift`);
  await expect(page.getByText(SECOND.station)).toBeVisible();
});

test('an event the person is not on the roster of is not shown', async ({ page }) => {
  await signIn(page, 'booth@spoh2027.test');
  await page.waitForURL(`**/e/${FIRST.slug}/home`);

  await page.goto(`/e/${SECOND.slug}/home`);
  await expect(page.getByRole('heading', { name: 'This event is not one of yours' })).toBeVisible();
  await expect(page.getByText(SECOND.station)).toHaveCount(0);
});
