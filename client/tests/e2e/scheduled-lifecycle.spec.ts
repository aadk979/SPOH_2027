import { randomUUID } from 'node:crypto';
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

async function restoreFixtures(
  db: pg.Client,
  input: { ids: string[]; status: string; windowId?: string; registrationId?: string },
) {
  await db.query('BEGIN');
  try {
    await db.query('SELECT id FROM "Event" WHERE id=$1 FOR UPDATE', [EVENT_ID]);
    await db.query(
      'UPDATE "ScheduledAction" SET status=$1,"completedAt"=now(),"lockedBy"=NULL,"lockedUntil"=NULL,version=version+1 WHERE "eventId"=$2 AND id=ANY($3::text[]) AND status IN (\'PENDING\',\'RUNNING\')',
      ['CANCELLED', EVENT_ID, input.ids],
    );
    if (input.windowId)
      await db.query('DELETE FROM "FallbackWindow" WHERE "eventId"=$1 AND id=$2', [
        EVENT_ID,
        input.windowId,
      ]);
    if (input.registrationId)
      await db.query('DELETE FROM "Registration" WHERE "eventId"=$1 AND id=$2', [
        EVENT_ID,
        input.registrationId,
      ]);
    await db.query('UPDATE "Event" SET status=$1 WHERE id=$2', [input.status, EVENT_ID]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
  // Retain the worker's immutable synthetic receipts in this dedicated test database.
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`the running worker changes lifecycle, capture admission and practice banner (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = (
      await db.query<{ status: string }>('SELECT status FROM "Event" WHERE id=$1', [EVENT_ID])
    ).rows[0]!;
    const ids: string[] = [];
    let windowId: string | undefined;
    let registrationId: string | undefined;
    try {
      await db.query('UPDATE "Event" SET status=$1 WHERE id=$2', ['REHEARSAL', EVENT_ID]);
      const me = page.waitForRequest(
        (request) => request.url().endsWith('/me') && Boolean(request.headers().authorization),
      );
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('admin@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const observed = await me;
      const headers = { Authorization: observed.headers().authorization! };
      const base = observed.url().slice(0, -3);
      const api = new URL(base);
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Disposable API required');
      const creator = (
        await db.query<{ id: string }>('SELECT id FROM "Person" WHERE email=$1', [
          'admin@spoh2027.test',
        ])
      ).rows[0]!;
      const station = (
        await db.query<{ id: string }>(
          'SELECT s.id FROM "Station" s JOIN "StationType" t ON t.id=s."typeId" AND t."eventId"=s."eventId" WHERE s."eventId"=$1 AND s.active AND t."registersVisitors" LIMIT 1',
          [EVENT_ID],
        )
      ).rows[0]!;
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
      const window = await page.request.post(`${base}/fallback/windows`, {
        headers,
        data: { tier: 4, reason: 'Synthetic local timed lifecycle' },
      });
      expect(window.status()).toBe(201);
      windowId = (await window.json()).window.id;
      const enqueue = async (to: 'READY' | 'REHEARSAL') => {
        const version = (
          await db.query<{ lifecycleVersion: number }>(
            'SELECT "lifecycleVersion" FROM "Event" WHERE id=$1',
            [EVENT_ID],
          )
        ).rows[0]!.lifecycleVersion;
        const id = `remediation-timed-lifecycle-${randomUUID()}`;
        ids.push(id);
        await db.query(
          'INSERT INTO "ScheduledAction" (id,"eventId",type,payload,"runAt","createdByPersonId") VALUES ($1,$2,$3,$4::jsonb,now()+interval \'2 seconds\',$5)',
          [
            id,
            EVENT_ID,
            'event.transition',
            JSON.stringify({
              to,
              expectedVersion: version,
              reason: 'Synthetic local E2E verification',
            }),
            creator.id,
          ],
        );
        await expect
          .poll(
            async () =>
              (
                await db.query<{ status: string }>(
                  'SELECT status FROM "ScheduledAction" WHERE "eventId"=$1 AND id=$2',
                  [EVENT_ID, id],
                )
              ).rows[0]?.status,
            { timeout: 30_000 },
          )
          .toBe('SUCCEEDED');
        expect(
          (
            await db.query(
              'SELECT id FROM "AuditLog" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=$3',
              [EVENT_ID, id, 'SCHEDULE'],
            )
          ).rowCount,
        ).toBe(2);
        const state = await page.request.get(`${base}/lifecycle`, { headers });
        expect((await state.json()).lifecycle).toMatchObject({ status: to, version: version + 1 });
      };
      await enqueue('READY');
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toHaveCount(0, {
        timeout: 30_000,
      });
      expect(
        (
          await db.query('SELECT "endedAt" FROM "FallbackWindow" WHERE "eventId"=$1 AND id=$2', [
            EVENT_ID,
            windowId,
          ])
        ).rows[0]?.endedAt,
      ).not.toBeNull();
      const body = () => ({
        stationId: station.id,
        category: 'SEC_4',
        rehearsal: true,
        idempotencyKey: randomUUID(),
      });
      expect(
        (await page.request.post(`${base}/registrations`, { headers, data: body() })).status(),
      ).toBe(409);
      await enqueue('REHEARSAL');
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible({
        timeout: 30_000,
      });
      const captured = await page.request.post(`${base}/registrations`, { headers, data: body() });
      expect(captured.status()).toBe(201);
      registrationId = (await captured.json()).registration.id;
      expect(
        (
          await db.query('SELECT rehearsal FROM "Registration" WHERE "eventId"=$1 AND id=$2', [
            EVENT_ID,
            registrationId,
          ])
        ).rows[0]?.rehearsal,
      ).toBe(true);
    } finally {
      await restoreFixtures(db, { ids, status: original.status, windowId, registrationId });
    }
  });
}
