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
  test(`practice banner and outside-hours capture close on go-live (${name})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = await db.query<{ status: string }>(
      'SELECT status FROM "Event" WHERE id = $1',
      [EVENT_ID],
    );
    const shifts = await db.query<{ id: string; startsAt: Date; endsAt: Date }>(
      'SELECT id, "startsAt", "endsAt" FROM "Shift" WHERE "eventId" = $1',
      [EVENT_ID],
    );
    let alertId: string | undefined;
    const description = `Practice phase-change search ${name}`;
    try {
      await db.query(
        'UPDATE "Shift" SET "startsAt" = now() + interval \'1 day\', "endsAt" = now() + interval \'2 days\' WHERE "eventId" = $1',
        [EVENT_ID],
      );
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['REHEARSAL', EVENT_ID]);
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('booth@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      await page.goto('/e/spoh2027/safety/lost-person/new');
      await page.getByLabel(/What has happened/).fill(description);
      const raised = page.waitForResponse(
        (result) => result.url().endsWith('/lost-person') && result.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /Alert every volunteer/ }).click();
      const alert = await raised;
      expect(alert.status()).toBe(201);
      const record = (await alert.json()).alert;
      alertId = record.id;
      expect(record.rehearsal).toBe(true);
      await page.waitForURL('**/home');
      await expect(page.getByText('REHEARSAL · Lost person practice alert')).toBeVisible();
      await page.goto('/e/spoh2027/capture/registration');
      const banner = page.getByRole('note', { name: 'Rehearsal mode' });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('Practice captures, cards and stock');
      const response = page.waitForResponse(
        (result) => result.url().includes('/registrations') && result.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Sec 4', exact: true }).click();
      const capture = await response;
      expect(capture.status()).toBe(201);
      const row = (await capture.json()).registration;
      const stored = await db.query<{ rehearsal: boolean }>(
        'SELECT rehearsal FROM "Registration" WHERE "eventId" = $1 AND id = $2',
        [EVENT_ID, row.id],
      );
      expect(stored.rows[0]?.rehearsal).toBe(true);
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['LIVE', EVENT_ID]);
      await expect(banner).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByText(description)).toHaveCount(0, { timeout: 20_000 });
      await expect(
        page.getByText('You are not on shift at the sign-up booth right now', { exact: false }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Sec 4', exact: true })).toHaveCount(0);
    } finally {
      if (alertId)
        await db.query('DELETE FROM "LostPersonAlert" WHERE "eventId" = $1 AND id = $2', [
          EVENT_ID,
          alertId,
        ]);
      for (const shift of shifts.rows)
        await db.query(
          'UPDATE "Shift" SET "startsAt" = $1, "endsAt" = $2 WHERE "eventId" = $3 AND id = $4',
          [shift.startsAt, shift.endsAt, EVENT_ID, shift.id],
        );
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', [
        original.rows[0]?.status,
        EVENT_ID,
      ]);
      await db.end();
    }
  });
}
