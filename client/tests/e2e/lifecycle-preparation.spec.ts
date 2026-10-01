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
  test(`audited preparation API updates practice windows and the banner (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = await db.query<{ status: string }>(
      'SELECT status FROM "Event" WHERE id = $1',
      [EVENT_ID],
    );
    let windowId: string | undefined;
    try {
      await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['REHEARSAL', EVENT_ID]);
      const me = page.waitForRequest(
        (request) => request.url().endsWith('/me') && Boolean(request.headers().authorization),
      );
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('chief@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const observed = await me;
      const headers = { Authorization: observed.headers().authorization! };
      const endpoint = observed.url().replace(/\/me$/, '/lifecycle');
      const api = new URL(endpoint);
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Disposable local API required');
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
      const initial = await (await page.request.get(endpoint, { headers })).json();
      const declared = await page.request.post(
        endpoint.replace(/\/lifecycle$/, '/fallback/windows'),
        { headers, data: { tier: 4, reason: `Practice preparation ${name}` } },
      );
      expect(declared.status()).toBe(201);
      windowId = (await declared.json()).window.id;
      const ready = await page.request.post(endpoint, {
        headers,
        data: {
          to: 'READY',
          expectedVersion: initial.lifecycle.version,
          idempotencyKey: randomUUID(),
          reason: 'Finish practice',
        },
      });
      expect(ready.status()).toBe(200);
      const state = (await ready.json()).lifecycle;
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toHaveCount(0, {
        timeout: 30_000,
      });
      expect(
        (
          await db.query(
            'SELECT "endedAt" FROM "FallbackWindow" WHERE "eventId" = $1 AND id = $2',
            [EVENT_ID, windowId],
          )
        ).rows[0]?.endedAt,
      ).not.toBeNull();
      const audit = await db.query<{ after: { closedWindows: string[]; action: string } }>(
        'SELECT after FROM "AuditLog" WHERE "eventId" = $1 AND action = $2 AND after->>\'version\' = $3',
        [EVENT_ID, 'event.transition', String(state.version)],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0]?.after.action).toBe('Event.Rehearse');
      expect(audit.rows[0]?.after.closedWindows).toContain(windowId);
      const practice = await page.request.post(endpoint, {
        headers,
        data: { to: 'REHEARSAL', expectedVersion: state.version, idempotencyKey: randomUUID() },
      });
      expect(practice.status()).toBe(200);
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible({
        timeout: 30_000,
      });
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
