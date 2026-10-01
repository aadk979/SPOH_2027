import pg from 'pg';
import { expect, test } from '@playwright/test';

const EVENT_ID = 'evt_spoh2027';
function databaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL;
  if (!value) throw new Error('E2E_DATABASE_URL is required');
  const url = new URL(value);
  if (url.hostname !== 'localhost' || !url.pathname.endsWith('_test'))
    throw new Error('Dedicated local _test database required');
  return value;
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`a closed practice window keeps its import practice after go-live (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    page.setDefaultTimeout(15_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = await db.query<{ status: string }>(
      'SELECT status FROM "Event" WHERE id = $1',
      [EVENT_ID],
    );
    let windowId: string | undefined;
    const reason = `Import practice window ${name}`;
    try {
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['REHEARSAL', EVENT_ID]);
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('chief@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      await page.goto('/e/spoh2027/chief/fallback');
      await page.getByText('Tier 4 — paper pack', { exact: true }).click();
      await page.getByLabel('What has happened?').fill(reason);
      const declared = page.waitForResponse(
        (response) =>
          response.url().endsWith('/fallback/windows') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Declare Tier 4' }).click();
      const declaration = await declared;
      expect(declaration.status()).toBe(201);
      const record = (await declaration.json()).window;
      windowId = record.id;
      expect(record.rehearsal).toBe(true);
      const ownWindow = page.getByRole('listitem').filter({ hasText: reason });
      await expect(ownWindow).toContainText('REHEARSAL · Practice window');
      await ownWindow.getByRole('button', { name: /Close the Tier 4 window/ }).click();
      await expect(ownWindow.getByRole('button')).toHaveCount(0);
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['LIVE', EVENT_ID]);
      await page.goto('/e/spoh2027/chief/imports');
      await page.getByText('Paper tally', { exact: true }).click();
      const selected = page.getByLabel(/Source fallback window/);
      await expect(selected.locator(`option[value="${windowId}"]`)).toContainText(
        'REHEARSAL · Practice',
      );
      await expect(selected.locator(`option[value="${windowId}"]`)).toContainText('Closed');
      await selected.selectOption(windowId!);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const now = new Date().toISOString();
      await page
        .getByLabel('Rows (CSV)')
        .fill(`category,stationCode,timeBlockStart,count\nSEC_4,SIGNUP_BOOTH,${now},2`);
      await page.getByLabel(/File name/).fill(`practice-${name}-${windowId}.csv`);
      await page.getByRole('button', { name: 'Preview — writes nothing' }).click();
      await expect(page.getByText('REHEARSAL · Practice import')).toBeVisible();
      const imported = page.waitForResponse(
        (response) =>
          response.url().endsWith('/imports/registrations') &&
          response.request().postDataJSON()?.commit === true,
      );
      await page.getByRole('button', { name: 'Import 2 records as paper' }).click();
      const response = await imported;
      expect(response.status()).toBe(201);
      const result = await response.json();
      expect(result.rehearsal).toBe(true);
      await expect(page.getByText('Imported', { exact: true })).toBeVisible();
      await expect(page.getByText('REHEARSAL · Practice import')).toBeVisible();
      const rows = await db.query<{ rehearsal: boolean; source: string }>(
        'SELECT rehearsal, source FROM "Registration" WHERE "eventId" = $1 AND "recordedAt" = $2 AND source = $3',
        [EVENT_ID, now, 'PAPER'],
      );
      expect(rows.rows).toEqual([
        { rehearsal: true, source: 'PAPER' },
        { rehearsal: true, source: 'PAPER' },
      ]);
      const batch = await db.query<{ rehearsal: boolean }>(
        'SELECT rehearsal FROM "ImportBatch" WHERE "eventId" = $1 AND id = $2',
        [EVENT_ID, result.importBatchId],
      );
      expect(batch.rows[0]?.rehearsal).toBe(true);
      const summary = page.waitForResponse((response) =>
        response.url().endsWith('/reports/summary'),
      );
      await page.goto('/e/spoh2027/reports');
      const report = await (await summary).json();
      const live = await db.query<{ count: string }>(
        'SELECT count(*) FROM "Registration" WHERE "eventId" = $1 AND rehearsal = false AND voided = false',
        [EVENT_ID],
      );
      expect(report.registrations.total).toBe(Number(live.rows[0]?.count));
      expect(report.rehearsalIncluded).toBe(false);
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['REHEARSAL', EVENT_ID]);
      await page.goto('/e/spoh2027/chief/imports');
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible({
        timeout: 30_000,
      });
      const unboundAt = new Date().toISOString();
      await page
        .getByLabel('Rows (CSV)')
        .fill(`category,stationCode,timeBlockStart,count\nSEC_4,SIGNUP_BOOTH,${unboundAt},2`);
      await page.getByRole('button', { name: 'Preview — writes nothing' }).click();
      await expect(page.getByText('REHEARSAL · Practice import')).toBeVisible();
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['LIVE', EVENT_ID]);
      const refused = page.waitForResponse(
        (response) =>
          response.url().endsWith('/imports/registrations') &&
          response.request().postDataJSON()?.commit === true,
      );
      await page.getByRole('button', { name: 'Import 2 records as fallback sheet' }).click();
      expect((await refused).status()).toBe(409);
      await expect(
        page.getByRole('alert').filter({ hasText: 'changed rehearsal/live mode' }),
      ).toBeVisible();
      expect(
        (
          await db.query(
            'SELECT id FROM "Registration" WHERE "eventId" = $1 AND "recordedAt" = $2',
            [EVENT_ID, unboundAt],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      if (windowId)
        await db.query('DELETE FROM "FallbackWindow" WHERE "eventId" = $1 AND id = $2', [
          EVENT_ID,
          windowId,
        ]);
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', [
        original.rows[0]?.status,
        EVENT_ID,
      ]);
      await db.end();
    }
  });
}
