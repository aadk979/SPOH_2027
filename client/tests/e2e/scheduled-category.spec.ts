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
  input: {
    ids: string[];
    category: { id: string; active: boolean; updatedAt: Date };
    registrationId?: string;
  },
) {
  await db.query('BEGIN');
  try {
    await db.query('SELECT id FROM "Event" WHERE id=$1 FOR UPDATE', [EVENT_ID]);
    await db.query(
      'UPDATE "ScheduledAction" SET status=$1,"completedAt"=now(),"lockedBy"=NULL,"lockedUntil"=NULL,version=version+1 WHERE "eventId"=$2 AND id=ANY($3::text[]) AND status IN (\'PENDING\',\'RUNNING\')',
      ['CANCELLED', EVENT_ID, input.ids],
    );
    await db.query(
      'UPDATE "CaptureCategory" SET active=$1,"updatedAt"=$2 WHERE "eventId"=$3 AND id=$4',
      [input.category.active, input.category.updatedAt, EVENT_ID, input.category.id],
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
  // Retain immutable synthetic action/audit receipts in this dedicated local test database.
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['laptop', 1440, 900],
] as const) {
  test(`the worker hides and restores a category on an open booth (${name})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    const db = new pg.Client({ connectionString: databaseUrl() });
    await db.connect();
    const category = (
      await db.query<{ id: string; code: string; label: string; active: boolean; updatedAt: Date }>(
        'SELECT id,code,label,active,"updatedAt" FROM "CaptureCategory" WHERE "eventId"=$1 AND code=$2',
        [EVENT_ID, 'SEC_4'],
      )
    ).rows[0]!;
    const ids: string[] = [];
    let registrationId: string | undefined;
    try {
      const me = page.waitForRequest(
        (request) => request.url().endsWith('/me') && Boolean(request.headers().authorization),
      );
      await page.goto('/sign-in');
      await page.getByLabel('Roster email').fill('booth@spoh2027.test');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('**/home');
      const observed = await me;
      const headers = { Authorization: observed.headers().authorization! };
      const base = observed.url().slice(0, -3);
      const api = new URL(base);
      if (api.hostname !== 'localhost' || api.port !== '4012')
        throw new Error('Disposable API required');
      const profile = await (await page.request.get(`${base}/me`, { headers })).json();
      const stationId: string = profile.currentAssignment.station.id;
      const creator = (
        await db.query<{ id: string }>('SELECT id FROM "Person" WHERE email=$1', [
          'admin@spoh2027.test',
        ])
      ).rows[0]!;
      await page.getByRole('link', { name: /Register a visitor/ }).click();
      await page.waitForURL('**/capture/registration');
      const button = page.getByRole('button', { name: category.label, exact: true });
      await expect(button).toBeVisible();
      const enqueue = async (active: boolean) => {
        const id = `remediation-timed-category-${randomUUID()}`;
        ids.push(id);
        await db.query(
          'INSERT INTO "ScheduledAction" (id,"eventId",type,payload,"runAt","createdByPersonId") VALUES ($1,$2,$3,$4::jsonb,now()+interval \'2 seconds\',$5)',
          [
            id,
            EVENT_ID,
            'taxonomy.setActive',
            JSON.stringify({ kind: 'category', id: category.id, active }),
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
            await db.query<{ active: boolean }>(
              'SELECT active FROM "CaptureCategory" WHERE "eventId"=$1 AND id=$2',
              [EVENT_ID, category.id],
            )
          ).rows[0]?.active,
        ).toBe(active);
        expect(
          (
            await db.query(
              'SELECT id FROM "AuditLog" WHERE "eventId"=$1 AND "scheduledActionId"=$2 AND source=$3',
              [EVENT_ID, id, 'SCHEDULE'],
            )
          ).rowCount,
        ).toBe(2);
      };
      await enqueue(false);
      await expect(button).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Other', exact: true })).toBeVisible();
      const body = () => ({ stationId, category: category.code, idempotencyKey: randomUUID() });
      const paused = await page.request.post(`${base}/registrations`, { headers, data: body() });
      expect(paused.status()).toBe(409);
      expect((await paused.json()).error.message).toContain('category');
      await enqueue(true);
      await expect(button).toBeVisible();
      const resumed = await page.request.post(`${base}/registrations`, { headers, data: body() });
      expect(resumed.status()).toBe(201);
      registrationId = (await resumed.json()).registration.id;
      await expect(page.getByRole('note', { name: 'Rehearsal mode' })).toBeVisible();
    } finally {
      await restoreFixtures(db, { ids, category, registrationId });
    }
  });
}
