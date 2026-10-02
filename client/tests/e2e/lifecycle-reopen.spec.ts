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
  test(`reopen returns to current reports and reclose freezes new evidence (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = (
      await db.query<{ status: string; closedAt: Date | null; organisationId: string }>(
        'SELECT status, "closedAt", "organisationId" FROM "Event" WHERE id=$1',
        [EVENT_ID],
      )
    ).rows[0]!;
    const chief = (
      await db.query<{ id: string }>('SELECT id FROM "Person" WHERE email=$1', [
        'chief@spoh2027.test',
      ])
    ).rows[0]!;
    const membership = (
      await db.query<{ id: string; role: string }>(
        'SELECT id, role FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
        [original.organisationId, chief.id],
      )
    ).rows[0];
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
    const versions: number[] = [];
    try {
      if (membership)
        await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
          'PLATFORM_ADMIN',
          membership.id,
        ]);
      else
        await db.query(
          'INSERT INTO "OrganisationMembership" (id, "organisationId", "personId", role, "updatedAt") VALUES ($1,$2,$3,$4,NOW())',
          [randomUUID(), original.organisationId, chief.id, 'PLATFORM_ADMIN'],
        );
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=NULL WHERE id=$2', [
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
      const first = await page.request.post(`${base}/lifecycle`, {
        headers,
        data: {
          to: 'CLOSED',
          expectedVersion: initial.lifecycle.version,
          idempotencyKey: randomUUID(),
        },
      });
      expect(first.status()).toBe(200);
      const closed = (await first.json()).lifecycle;
      versions.push(closed.version);
      const frozen = await (await page.request.get(`${base}/reports/summary`, { headers })).json();
      await page.goto('/e/spoh2027/reports');
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Frozen final report',
      );
      const reopen = await page.request.post(`${base}/lifecycle`, {
        headers,
        data: {
          to: 'LIVE',
          expectedVersion: closed.version,
          reason: 'Correct a mistaken test close',
          idempotencyKey: randomUUID(),
        },
      });
      expect(reopen.status()).toBe(200);
      const live = (await reopen.json()).lifecycle;
      const refreshed = page.waitForRequest(
        (request) => request.url().endsWith('/me') && Boolean(request.headers().authorization),
      );
      await page.reload();
      headers.Authorization = (await refreshed).headers().authorization!;
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Current report — figures can change',
      );
      await expect(
        page.getByRole('checkbox', { name: 'Show current data after close' }),
      ).toHaveCount(0);
      const currentResponse = await page.request.get(`${base}/reports/summary`, { headers });
      expect(currentResponse.status()).toBe(200);
      const current = await currentResponse.json();
      expect(current.snapshot).toBeUndefined();
      const reclosed = await page.request.post(`${base}/lifecycle`, {
        headers,
        data: { to: 'CLOSED', expectedVersion: live.version, idempotencyKey: randomUUID() },
      });
      expect(reclosed.status()).toBe(200);
      const second = (await reclosed.json()).lifecycle;
      versions.push(second.version);
      const final = await (await page.request.get(`${base}/reports/summary`, { headers })).json();
      expect(final.snapshot.id).not.toBe(frozen.snapshot.id);
      expect(final.snapshot.lifecycleVersion).toBe(second.version);
      await page.reload();
      await expect(page.getByRole('note', { name: 'Report version' })).toContainText(
        'Frozen final report',
      );
      await expect(
        page.getByRole('checkbox', { name: 'Show current data after close' }),
      ).toBeVisible();
      const saved = (
        await db.query<{ report: unknown; supersededAt: Date | null }>(
          'SELECT report, "supersededAt" FROM "ReportSnapshot" WHERE "eventId"=$1 AND id=$2',
          [EVENT_ID, frozen.snapshot.id],
        )
      ).rows[0]!;
      expect(saved.supersededAt).not.toBeNull();
      const { snapshot: _metadata, ...document } = frozen;
      expect(saved.report).toEqual(document);
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
      for (const version of versions) {
        await db.query(
          'DELETE FROM "ReportSnapshot" WHERE "eventId"=$1 AND "lifecycleVersion"=$2',
          [EVENT_ID, version],
        );
        await db.query(
          'DELETE FROM "ScheduledAction" WHERE "eventId"=$1 AND type=$2 AND payload->>\'lifecycleVersion\'=$3',
          [EVENT_ID, 'event.archiveReminder', String(version)],
        );
      }
      if (membership)
        await db.query('UPDATE "OrganisationMembership" SET role=$1 WHERE id=$2', [
          membership.role,
          membership.id,
        ]);
      else
        await db.query(
          'DELETE FROM "OrganisationMembership" WHERE "organisationId"=$1 AND "personId"=$2',
          [original.organisationId, chief.id],
        );
      await db.query('UPDATE "Event" SET status=$1, "closedAt"=$2 WHERE id=$3', [
        original.status,
        original.closedAt,
        EVENT_ID,
      ]);
      await db.end();
    }
  });
}
