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
  input: { ids: string[]; original?: { id: string; value: unknown }; registrationId?: string },
) {
  await db.query('BEGIN');
  try {
    // Match the worker's Event-before-action order before cancelling leftover synthetic work.
    await db.query('SELECT id FROM "Event" WHERE id=$1 FOR UPDATE', [EVENT_ID]);
    await db.query(
      'UPDATE "ScheduledAction" SET status=$1,"completedAt"=now(),"lockedBy"=NULL,"lockedUntil"=NULL,version=version+1 WHERE "eventId"=$2 AND id=ANY($3::text[]) AND status IN (\'PENDING\',\'RUNNING\')',
      ['CANCELLED', EVENT_ID, input.ids],
    );
    if (input.original)
      await db.query('UPDATE "Setting" SET value=$1::jsonb WHERE "eventId"=$2 AND id=$3', [
        JSON.stringify(input.original.value),
        EVENT_ID,
        input.original.id,
      ]);
    else
      await db.query(
        'DELETE FROM "Setting" WHERE "eventId"=$1 AND scope=$2 AND "scopeId"=$1 AND key=$3',
        [EVENT_ID, 'EVENT', 'capture.open'],
      );
    if (input.registrationId)
      await db.query('DELETE FROM "Registration" WHERE "eventId"=$1 AND id=$2', [
        EVENT_ID,
        input.registrationId,
      ]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
  // Keep immutable synthetic schedule/history/audit receipts in this dedicated test database.
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`the running worker applies a timed capture pause and resume (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const original = (
      await db.query<{ id: string; value: unknown; version: number }>(
        'SELECT id,value,version FROM "Setting" WHERE "eventId"=$1 AND scope=$2 AND "scopeId"=$1 AND key=$3',
        [EVENT_ID, 'EVENT', 'capture.open'],
      )
    ).rows[0];
    const ids: string[] = [];
    let registrationId: string | undefined;
    try {
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
      if (api.hostname !== 'localhost' || api.port !== '4012') {
        throw new Error('Disposable API required');
      }
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
      const enqueue = async (value: boolean, expectedVersion: number) => {
        const id = `remediation-timed-capture-${randomUUID()}`;
        ids.push(id);
        await db.query(
          'INSERT INTO "ScheduledAction" (id,"eventId",type,payload,"runAt","createdByPersonId") VALUES ($1,$2,$3,$4::jsonb,now()+interval \'2 seconds\',$5)',
          [
            id,
            EVENT_ID,
            'setting.apply',
            JSON.stringify({
              scope: 'event',
              scopeId: EVENT_ID,
              key: 'capture.open',
              value,
              expectedVersion,
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
        const row = (
          await db.query<{ value: boolean; version: number }>(
            'SELECT value,version FROM "Setting" WHERE "eventId"=$1 AND scope=$2 AND "scopeId"=$1 AND key=$3',
            [EVENT_ID, 'EVENT', 'capture.open'],
          )
        ).rows[0]!;
        expect(row.value).toBe(value);
        expect(
          (
            await db.query(
              'SELECT id FROM "SettingChange" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=$3',
              [EVENT_ID, id, 'SCHEDULE'],
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await db.query(
              'SELECT id FROM "AuditLog" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=$3',
              [EVENT_ID, id, 'SCHEDULE'],
            )
          ).rowCount,
        ).toBe(2);
        return row.version;
      };
      const pausedVersion = await enqueue(false, original?.version ?? 0);
      const body = () => ({
        stationId: station.id,
        category: 'SEC_4',
        idempotencyKey: randomUUID(),
      });
      const paused = await page.request.post(`${base}/registrations`, { headers, data: body() });
      expect(paused.status()).toBe(409);
      expect((await paused.json()).error.message).toContain('paused');
      await enqueue(true, pausedVersion);
      const resumed = await page.request.post(`${base}/registrations`, { headers, data: body() });
      expect(resumed.status()).toBe(201);
      registrationId = (await resumed.json()).registration.id;
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
    } finally {
      await restoreFixtures(db, { ids, original, registrationId });
    }
  });
}
