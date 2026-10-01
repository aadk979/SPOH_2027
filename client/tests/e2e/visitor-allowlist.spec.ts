import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';

const EVENT_ID = 'evt_spoh2027'; // The disposable development fixture only.
const DB_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://spoh:spoh@localhost:5435/spoh2027_p06_e2e_test';

function checkedTestDatabase(): string {
  const url = new URL(DB_URL);
  if (url.hostname !== 'localhost' || !url.pathname.endsWith('_test')) {
    throw new Error('Visitor browser test requires a local dedicated _test database.');
  }
  return DB_URL;
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Roster email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
}

test('an event declares a visitor field, captures it, and purges it on switch-off', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: checkedTestDatabase() });
  await db.connect();
  const original = await db.query<{ status: string }>('SELECT status FROM "Event" WHERE id = $1', [
    EVENT_ID,
  ]);
  const code = `contact_${Date.now().toString(36)}`;
  const label = `Contact ${code}`;
  try {
    await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['READY', EVENT_ID]);
    await signIn(page, 'chief@spoh2027.test');
    await page.goto('/e/spoh2027/admin/settings');
    await page.getByText('Only the fields this event declares', { exact: true }).click();
    await page.getByRole('button', { name: 'Save visitor data' }).click();
    await expect(page.getByRole('heading', { name: 'Fields this event collects' })).toBeVisible();

    await page.getByLabel('Code', { exact: true }).fill(code);
    await page.locator('#new-visitor-label').fill(label);
    await page.getByLabel('Input type').selectOption('email');
    await page.locator('#new-visitor-retention').fill('7');
    await page.getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByText(code, { exact: false })).toBeVisible();

    const booth = await browser.newPage();
    try {
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['REHEARSAL', EVENT_ID]);
      await signIn(booth, 'booth@spoh2027.test');
      await booth.goto('/e/spoh2027/capture/registration');
      await expect(
        booth.getByRole('heading', { name: 'Registration with visitor details' }),
      ).toBeVisible();
      await booth.getByLabel('Category').selectOption('SEC_4');
      await booth.getByLabel(label).fill('visitor@example.test');
      await booth.getByRole('button', { name: 'Record with details' }).click();
      await expect(booth.getByRole('status')).toContainText('Registration recorded');
      const kept = await db.query<{ data: { [key: string]: string } }>(
        'SELECT data FROM "VisitorRecord" WHERE "eventId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
        [EVENT_ID],
      );
      expect(kept.rows[0]?.data[code]).toBe('visitor@example.test');
    } finally {
      await booth.close();
    }

    await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['READY', EVENT_ID]);
    await page.reload();
    await page.getByText('None', { exact: true }).click();
    await page.getByRole('button', { name: 'Save visitor data' }).click();
    await expect
      .poll(async () => {
        const result = await db.query<{ count: string }>(
          'SELECT count(*) FROM "VisitorRecord" WHERE "eventId" = $1',
          [EVENT_ID],
        );
        return Number(result.rows[0]?.count);
      })
      .toBe(0);
  } finally {
    // This test's state must not leak into the other browser journeys.
    await db.query('DELETE FROM "VisitorRecord" WHERE "eventId" = $1', [EVENT_ID]);
    await db.query('DELETE FROM "VisitorField" WHERE "eventId" = $1 AND code = $2', [
      EVENT_ID,
      code,
    ]);
    await db.query('DELETE FROM "Setting" WHERE "eventId" = $1 AND key = $2', [
      EVENT_ID,
      'product.visitorDataMode',
    ]);
    await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', [
      original.rows[0]?.status,
      EVENT_ID,
    ]);
    await db.end();
  }
});
