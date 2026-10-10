import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { promoteToPlatformAdmin } from './platformAdmin';

/**
 * The role permissions screen (P11.7): a platform admin edits a permission, it takes effect for
 * that role on the next request, and the simulator explains a refusal. Runs in the P16
 * verification campaign (ADR-011) against the dedicated browser database.
 */

const CHIEF = 'chief@spoh2027.test';
const LEAD = 'lead@spoh2027.test';

function checkedDatabase(): string {
  const database = new URL(process.env.E2E_DATABASE_URL ?? 'about:blank');
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/spoh2027_rehearsal_shift_e2e_test'
  )
    throw new Error('Dedicated local browser database required');
  return database.toString();
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

async function openPermissions(page: Page): Promise<void> {
  await page.goto(page.url().replace(/\/home$/, '/admin/permissions'));
  await expect(page.getByRole('heading', { name: 'Role permissions' })).toBeVisible();
}

test('a platform admin gives Lead the event configuration, and Lead sees it next', async ({
  page,
  browser,
}) => {
  const db = new pg.Client({ connectionString: checkedDatabase() });
  await db.connect();
  const restore = await promoteToPlatformAdmin(db, CHIEF);
  try {
    await signIn(page, CHIEF);
    await openPermissions(page);
    await page.getByLabel('Role').selectOption('LEAD');
    const read = page.getByRole('checkbox', { name: "See the event's configuration" });
    await expect(read).not.toBeChecked();
    await read.check();
    await expect(read).toBeChecked();

    const lead = await browser.newPage();
    await signIn(lead, LEAD);
    await openPermissions(lead);
    await expect(lead.getByRole('checkbox', { name: 'Register visitors' })).toBeDisabled();
    await lead.close();

    await read.uncheck();
    await expect(read).not.toBeChecked();
  } finally {
    await restore();
    await db.end();
  }
});

test('the simulator explains why a role is refused', async ({ page }) => {
  await signIn(page, CHIEF);
  await openPermissions(page);
  await page.getByLabel('Person').selectOption({ label: 'Lead' });
  await page.getByLabel('Action').selectOption('Report.Export');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Allowed|Refused/ })).toBeVisible();
});
