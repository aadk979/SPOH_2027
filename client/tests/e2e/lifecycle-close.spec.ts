import pg from 'pg';
import { randomUUID } from 'node:crypto';
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
  test(`atomic close, frozen/current labels and export (${name})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = (
      await db.query<{ status: string; closedAt: Date | null }>(
        'SELECT status, "closedAt" FROM "Event" WHERE id = $1',
        [EVENT_ID],
      )
    ).rows[0]!;
    const windows = (
      await db.query<{ id: string; endedAt: Date | null }>(
        'SELECT id, "endedAt" FROM "FallbackWindow" WHERE "eventId"=$1',
        [EVENT_ID],
      )
    ).rows;
    const items = (
      await db.query<{ id: string; status: string }>(
        'SELECT id, status FROM "LostFoundItem" WHERE "eventId"=$1',
        [EVENT_ID],
      )
    ).rows;
    let version: number | undefined;
    let registrationId: string | undefined;
    try {
      await db.query('UPDATE "Event" SET status = $1, "closedAt" = NULL WHERE id = $2', [
        'LIVE',
        EVENT_ID,
      ]);
      const me = page.waitForRequest(
        (request) => request.url().endsWith('/me') && Boolean(request.headers().authorization),
      );
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('chief@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const observed = await me;
      const headers = { Authorization: observed.headers().authorization! };
      const base = observed.url().replace(/\/me$/, '');
      const api = new URL(base);
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Disposable API required');
      const initial = await (await page.request.get(`${base}/lifecycle`, { headers })).json();
      const closed = await page.request.post(`${base}/lifecycle`, {
        headers,
        data: {
          to: 'CLOSED',
          expectedVersion: initial.lifecycle.version,
          idempotencyKey: randomUUID(),
        },
      });
      expect(closed.status()).toBe(200);
      version = (await closed.json()).lifecycle.version;
      const frozen = await (await page.request.get(`${base}/reports/summary`, { headers })).json();
      const station = (
        await db.query<{ id: string }>(
          'SELECT s.id FROM "Station" s JOIN "StationType" t ON t.id=s."typeId" AND t."eventId"=s."eventId" WHERE s."eventId"=$1 AND s.active AND t."registersVisitors" LIMIT 1',
          [EVENT_ID],
        )
      ).rows[0]!;
      const late = await page.request.post(`${base}/registrations`, {
        headers,
        data: {
          stationId: station.id,
          category: 'SEC_4',
          rehearsal: false,
          clientRecordedAt: new Date(
            new Date(frozen.snapshot.createdAt).getTime() - 1000,
          ).toISOString(),
          idempotencyKey: randomUUID(),
        },
      });
      expect(late.status()).toBe(201);
      registrationId = (await late.json()).registration.id;
      await page.goto('/e/spoh2027/reports');
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Frozen final report',
      );
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Late sync and later corrections are excluded',
      );
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download CSV' }).click();
      expect((await download).suggestedFilename()).toContain('-frozen-final.csv');
      await page.screenshot({ path: `../.local/close-report-${name}.png`, fullPage: true });
      const current = page.waitForResponse((response) =>
        response.url().endsWith('/reports/summary?current=true'),
      );
      await page.getByRole('checkbox', { name: 'Show current data after close' }).check();
      expect((await (await current).json()).registrations.total).toBe(
        frozen.registrations.total + 1,
      );
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Current report — includes changes after close',
      );
      await page.getByRole('checkbox', { name: 'Show current data after close' }).uncheck();
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Frozen final report',
      );
      expect(await (await page.request.get(`${base}/reports/summary`, { headers })).json()).toEqual(
        frozen,
      );
    } finally {
      for (const window of windows)
        await db.query('UPDATE "FallbackWindow" SET "endedAt"=$1 WHERE "eventId"=$2 AND id=$3', [
          window.endedAt,
          EVENT_ID,
          window.id,
        ]);
      for (const item of items)
        await db.query('UPDATE "LostFoundItem" SET status=$1 WHERE "eventId"=$2 AND id=$3', [
          item.status,
          EVENT_ID,
          item.id,
        ]);
      if (registrationId)
        await db.query('DELETE FROM "Registration" WHERE "eventId"=$1 AND id=$2', [
          EVENT_ID,
          registrationId,
        ]);
      if (version !== undefined) {
        await db.query(
          'DELETE FROM "ReportSnapshot" WHERE "eventId"=$1 AND "lifecycleVersion"=$2',
          [EVENT_ID, version],
        );
        await db.query(
          'DELETE FROM "ScheduledAction" WHERE "eventId"=$1 AND type=$2 AND payload->>\'lifecycleVersion\'=$3',
          [EVENT_ID, 'event.archiveReminder', String(version)],
        );
      }
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=$2 WHERE id=$3', [
        original.status,
        original.closedAt,
        EVENT_ID,
      ]);
      await db.end();
    }
  });
}
