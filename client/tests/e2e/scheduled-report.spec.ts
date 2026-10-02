import { randomUUID } from 'node:crypto';
import { previousDate, zonedDate, zonedDayWindow } from '@spoh/shared';
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
  input: { actionIds: string[]; registrationIds: string[]; createdDayId?: string },
) {
  await db.query('BEGIN');
  try {
    await db.query('SELECT id FROM "Event" WHERE id=$1 FOR UPDATE', [EVENT_ID]);
    await db.query(
      'UPDATE "ScheduledAction" SET status=$1,"completedAt"=now(),"lockedBy"=NULL,"lockedUntil"=NULL,version=version+1 WHERE "eventId"=$2 AND id=ANY($3::text[]) AND status IN (\'PENDING\',\'RUNNING\')',
      ['CANCELLED', EVENT_ID, input.actionIds],
    );
    await db.query('DELETE FROM "Registration" WHERE "eventId"=$1 AND id=ANY($2::text[])', [
      EVENT_ID,
      input.registrationIds,
    ]);
    if (input.createdDayId)
      await db.query('DELETE FROM "EventDay" WHERE "eventId"=$1 AND id=$2', [
        EVENT_ID,
        input.createdDayId,
      ]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
  // Immutable synthetic documents and receipts remain in this dedicated test database.
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`the running worker freezes a bounded daily report with explicit practice labels (${name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const actionIds: string[] = [];
    const registrationIds: string[] = [];
    let createdDayId: string | undefined;
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
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Disposable API required');
      const event = (
        await db.query<{ timezone: string; dayBoundaryMinutes: number }>(
          'SELECT timezone,"dayBoundaryMinutes" FROM "Event" WHERE id=$1',
          [EVENT_ID],
        )
      ).rows[0]!;
      const now = new Date();
      const date = zonedDate(now, event.timezone);
      const operationalDate =
        now < zonedDayWindow(date, event.timezone, event.dayBoundaryMinutes).start
          ? previousDate(date)
          : date;
      const completedDate = previousDate(operationalDate);
      const range = zonedDayWindow(completedDate, event.timezone, event.dayBoundaryMinutes);
      const newDayId = `remediation-daily-day-${randomUUID()}`;
      const inserted = await db.query(
        'INSERT INTO "EventDay" (id,"eventId",date,label) VALUES ($1,$2,$3,$4) ON CONFLICT ("eventId",date) DO NOTHING RETURNING id',
        [newDayId, EVENT_ID, completedDate, 'Synthetic local daily snapshot'],
      );
      if (inserted.rowCount) createdDayId = newDayId;
      const day = (
        await db.query<{ id: string }>('SELECT id FROM "EventDay" WHERE "eventId"=$1 AND date=$2', [
          EVENT_ID,
          completedDate,
        ])
      ).rows[0]!;
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
      const category = (
        await db.query<{ id: string }>(
          'SELECT id FROM "CaptureCategory" WHERE "eventId"=$1 AND code=$2',
          [EVENT_ID, 'SEC_4'],
        )
      ).rows[0]!;
      for (const rehearsal of [false, true]) {
        const id = `remediation-daily-registration-${randomUUID()}`;
        registrationIds.push(id);
        await db.query(
          'INSERT INTO "Registration" (id,"eventId","stationId","categoryId",rehearsal,"recordedById","recordedAt","idempotencyKey") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, EVENT_ID, station.id, category.id, rehearsal, creator.id, range.start, randomUUID()],
        );
      }
      for (const includeRehearsal of [false, true]) {
        const id = `remediation-daily-report-${randomUUID()}`;
        actionIds.push(id);
        await db.query(
          'INSERT INTO "ScheduledAction" (id,"eventId",type,payload,"runAt","createdByPersonId") VALUES ($1,$2,$3,$4::jsonb,now()+interval \'2 seconds\',$5)',
          [
            id,
            EVENT_ID,
            'report.snapshot',
            JSON.stringify({ kind: 'daily', eventDayId: day.id, includeRehearsal }),
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
        const snapshot = (
          await db.query<{
            kind: string;
            rehearsalIncluded: boolean;
            report: {
              range: { from: string; to: string };
              rehearsalIncluded: boolean;
              registrations: { total: number };
            };
          }>(
            'SELECT kind,"rehearsalIncluded",report FROM "ReportSnapshot" WHERE "eventId"=$1 AND "dedupeKey"=$2',
            [EVENT_ID, `daily:scheduled:${id}`],
          )
        ).rows[0]!;
        expect(snapshot.kind).toBe('DAILY');
        expect(snapshot.rehearsalIncluded).toBe(includeRehearsal);
        expect(snapshot.report.rehearsalIncluded).toBe(includeRehearsal);
        expect(snapshot.report.range).toEqual({
          from: range.start.toISOString(),
          to: range.end.toISOString(),
        });
        const query = new URLSearchParams({
          from: range.start.toISOString(),
          to: range.end.toISOString(),
          includeRehearsal: String(includeRehearsal),
        });
        const current = await page.request.get(`${base}/reports/summary?${query}`, { headers });
        expect(current.status()).toBe(200);
        expect(snapshot.report.registrations.total).toBe(
          (await current.json()).registrations.total,
        );
        expect(
          (
            await db.query(
              'SELECT id FROM "AuditLog" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=$3',
              [EVENT_ID, id, 'SCHEDULE'],
            )
          ).rowCount,
        ).toBe(2);
      }
    } finally {
      await restoreFixtures(db, { actionIds, registrationIds, createdDayId });
    }
  });
}
