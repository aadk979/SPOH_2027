import pg from 'pg';
import { expect, test } from '@playwright/test';

const EVENT_ID = 'evt_spoh2027';
function databaseUrl(): string {
  const value = process.env.E2E_DATABASE_URL;
  if (!value) throw new Error('E2E_DATABASE_URL is required');
  const url = new URL(value);
  if (url.hostname !== 'localhost' || !url.pathname.endsWith('_test')) {
    throw new Error('Dedicated local _test database required');
  }
  return value;
}

test('an offline incident recorded before close syncs once with its original device timestamp', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const db = new pg.Client({ connectionString: databaseUrl() });
  await db.connect();
  const original = await db.query<{ status: string; closedAt: Date | null }>(
    'SELECT status, "closedAt" FROM "Event" WHERE id = $1',
    [EVENT_ID],
  );
  const description = `Offline close-grace incident ${Date.now()}`;
  try {
    await db.query('UPDATE "Event" SET status = $1, "closedAt" = NULL WHERE id = $2', [
      'LIVE',
      EVENT_ID,
    ]);
    await page.goto('/sign-in');
    await page.getByLabel('Roster email').fill('booth@spoh2027.test');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/home');
    await page.goto('/e/spoh2027/safety/incident/new');
    await page.getByLabel('What happened?').fill(description);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Queued. If anyone' })).toBeVisible();
    expect(
      (
        await db.query('SELECT id FROM "Incident" WHERE "eventId" = $1 AND description = $2', [
          EVENT_ID,
          description,
        ])
      ).rowCount,
    ).toBe(0);
    await db.query('UPDATE "Event" SET status = $1, "closedAt" = now() WHERE id = $2', [
      'CLOSED',
      EVENT_ID,
    ]);
    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (
            await db.query('SELECT id FROM "Incident" WHERE "eventId" = $1 AND description = $2', [
              EVENT_ID,
              description,
            ])
          ).rowCount,
        { timeout: 30_000 },
      )
      .toBe(1);
    const audit = await db.query<{
      after: { rehearsal: boolean; lateSync: { clientRecordedAt: string; closedAt: string } };
    }>(
      'SELECT audit.after FROM "AuditLog" audit JOIN "Incident" incident ON audit."eventId" = incident."eventId" AND audit."entityId" = incident.id WHERE incident."eventId" = $1 AND incident.description = $2 AND audit.action = $3',
      [EVENT_ID, description, 'incident.create'],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.after.rehearsal).toBe(false);
    const late = audit.rows[0]!.after.lateSync;
    expect(new Date(late.clientRecordedAt).getTime()).toBeLessThan(
      new Date(late.closedAt).getTime(),
    );
  } finally {
    await context.setOffline(false);
    await db.query(
      'DELETE FROM "AuditLog" WHERE "eventId" = $1 AND "entityId" IN (SELECT id FROM "Incident" WHERE "eventId" = $1 AND description = $2)',
      [EVENT_ID, description],
    );
    await db.query('DELETE FROM "Incident" WHERE "eventId" = $1 AND description = $2', [
      EVENT_ID,
      description,
    ]);
    await db.query('UPDATE "Event" SET status = $1, "closedAt" = $2 WHERE id = $3', [
      original.rows[0]?.status,
      original.rows[0]?.closedAt,
      EVENT_ID,
    ]);
    await db.end();
  }
});
