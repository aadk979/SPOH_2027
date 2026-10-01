import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

const migration = '20261002010000_derived_rehearsal_provenance';
const migrations = new URL('../../prisma/migrations/', import.meta.url);
const databaseName = 'spoh2027_derived_rehearsal_migration_test';
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${databaseName}`;
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
let db: pg.Client;
async function manageDatabase(sql: string) {
  if (!databaseName.endsWith('_test')) throw new Error('Dedicated _test database required');
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}
const children = [
  ['IncidentFollowUp', 'Incident', 'incidentId'],
  ['LostPersonAck', 'LostPersonAlert', 'alertId'],
  ['VisitorRecord', 'Registration', 'registrationId'],
] as const;

beforeAll(async () => {
  await manageDatabase(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await manageDatabase(`CREATE DATABASE ${databaseName}`);
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  for (const name of readdirSync(migrations)
    .filter((name) => name < migration)
    .sort())
    await db.query(readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8'));
  await db.query(`
    INSERT INTO "Event" (id, "organisationId", slug, name, timezone, "updatedAt")
      VALUES ('event', 'org_sp_school_of_computing', 'derived-migration', 'Migration', 'UTC', now()),
             ('foreign-event', 'org_sp_school_of_computing', 'foreign-derived-migration', 'Foreign', 'UTC', now());
    INSERT INTO "Person" (id, "cognitoSub", "displayName", email, "updatedAt")
      VALUES ('person', 'derived-migration-person', 'Migration', 'migration@example.test', now()),
             ('second-person', 'derived-migration-person-2', 'Second', 'second@example.test', now()),
             ('third-person', 'derived-migration-person-3', 'Third', 'third@example.test', now());
    INSERT INTO "StationType" (id, "eventId", code, label, "updatedAt") VALUES ('type', 'event', 'type', 'Type', now());
    INSERT INTO "Station" (id, "eventId", "typeId", code, name) VALUES ('station', 'event', 'type', 'station', 'Station');
    INSERT INTO "CaptureCategory" (id, "eventId", code, label, "updatedAt") VALUES ('category', 'event', 'category', 'Category', now());
  `);
  for (const rehearsal of [false, true]) {
    const mode = rehearsal ? 'practice' : 'live';
    await db.query(
      `INSERT INTO "Incident" (id, "eventId", rehearsal, type, severity, description, "reportedById", "occurredAt", "idempotencyKey")
      VALUES ($1, 'event', $2, 'OTHER', 'LOW', 'Migration incident', 'person', now(), $1)`,
      [mode, rehearsal],
    );
    await db.query(
      `INSERT INTO "LostPersonAlert" (id, "eventId", rehearsal, "raisedById") VALUES ($1, 'event', $2, 'person')`,
      [mode, rehearsal],
    );
    await db.query(
      `INSERT INTO "Registration" (id, "eventId", rehearsal, "categoryId", "stationId", "recordedById", "idempotencyKey")
      VALUES ($1, 'event', $2, 'category', 'station', 'person', $1)`,
      [mode, rehearsal],
    );
    await db.query(
      `INSERT INTO "IncidentFollowUp" (id, "eventId", "incidentId", note, "authorId") VALUES ($1, 'event', $1, 'Old note', 'person')`,
      [mode],
    );
    await db.query(
      `INSERT INTO "LostPersonAck" (id, "eventId", "alertId", "volunteerId") VALUES ($1, 'event', $1, 'person')`,
      [mode],
    );
    await db.query(
      `INSERT INTO "VisitorRecord" (id, "eventId", "registrationId", data) VALUES ($1, 'event', $1, '{"contact":"preserved"}')`,
      [mode],
    );
  }
  await db.query(readFileSync(new URL(`${migration}/migration.sql`, migrations), 'utf8'));
  await db.query(`INSERT INTO "Registration" (id, "eventId", rehearsal, "categoryId", "stationId", "recordedById", "idempotencyKey")
    VALUES ('explicit-practice', 'event', true, 'category', 'station', 'person', 'explicit-practice')`);
}, 60_000);
afterAll(async () => {
  await db?.end();
  await manageDatabase(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

it.each(children)(
  'backfills %s from its scoped parent and preserves its contents',
  async (table) => {
    const result = await db.query(
      `SELECT id, rehearsal FROM "${table}" WHERE "eventId" = 'event' ORDER BY id`,
    );
    expect(result.rows).toEqual([
      { id: 'live', rehearsal: false },
      { id: 'practice', rehearsal: true },
    ]);
    const column = await db.query(
      `SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 AND column_name = 'rehearsal'`,
      [table],
    );
    expect(column.rows).toEqual([{ is_nullable: 'NO', column_default: null }]);
  },
);

it.each(children)(
  'refuses %s mode changes which disagree with its parent',
  async (table, parent) => {
    await expect(
      db.query(
        `UPDATE "${table}" SET rehearsal = false WHERE "eventId" = 'event' AND id = 'practice'`,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      db.query(
        `UPDATE "${parent}" SET rehearsal = false WHERE "eventId" = 'event' AND id = 'practice'`,
      ),
    ).rejects.toMatchObject({ code: '23503' });
  },
);

it.each([false, true])(
  'supports a previous-version writer omitting the flag (practice %s)',
  async (rehearsal) => {
    const mode = rehearsal ? 'practice' : 'live';
    const note = await db.query(
      `INSERT INTO "IncidentFollowUp" (id, "eventId", "incidentId", note, "authorId") VALUES ($1, 'event', $2, 'Legacy writer', 'person') RETURNING rehearsal`,
      [`legacy-${mode}`, mode],
    );
    const ack = await db.query(
      `INSERT INTO "LostPersonAck" (id, "eventId", "alertId", "volunteerId") VALUES ($1, 'event', $2, 'second-person') RETURNING rehearsal`,
      [`legacy-${mode}`, mode],
    );
    await db.query(
      `INSERT INTO "Registration" (id, "eventId", rehearsal, "categoryId", "stationId", "recordedById", "idempotencyKey") VALUES ($1, 'event', $2, 'category', 'station', 'person', $1)`,
      [`legacy-${mode}`, rehearsal],
    );
    const visitor = await db.query(
      `INSERT INTO "VisitorRecord" (id, "eventId", "registrationId", data) VALUES ($1, 'event', $1, '{}') RETURNING rehearsal`,
      [`legacy-${mode}`],
    );
    expect([note.rows[0], ack.rows[0], visitor.rows[0]]).toEqual(
      Array.from({ length: 3 }, () => ({ rehearsal })),
    );
  },
);

it.each(children)('prevents %s ownership from drifting from its parent', async (table) => {
  await expect(
    db.query(
      `UPDATE "${table}" SET "eventId" = 'foreign-event' WHERE "eventId" = 'event' AND id = 'practice'`,
    ),
  ).rejects.toMatchObject({ code: '23503' });
});

it.each([
  [
    'IncidentFollowUp',
    `INSERT INTO "IncidentFollowUp" (id, "eventId", "incidentId", note, "authorId", rehearsal) VALUES ('wrong', 'event', 'practice', 'Wrong mode', 'person', false)`,
  ],
  [
    'LostPersonAck',
    `INSERT INTO "LostPersonAck" (id, "eventId", "alertId", "volunteerId", rehearsal) VALUES ('wrong', 'event', 'practice', 'third-person', false)`,
  ],
  [
    'VisitorRecord',
    `INSERT INTO "VisitorRecord" (id, "eventId", "registrationId", data, rehearsal) VALUES ('wrong', 'event', 'explicit-practice', '{}', false)`,
  ],
])('rejects an explicit wrong insert mode for %s', async (_table, sql) => {
  await expect(db.query(sql)).rejects.toMatchObject({ code: '23503' });
});

it('preserves the old follow-up notes and visitor values', async () => {
  expect(
    (
      await db.query(
        `SELECT note FROM "IncidentFollowUp" WHERE "eventId" = 'event' AND id = 'practice'`,
      )
    ).rows[0],
  ).toEqual({ note: 'Old note' });
  expect(
    (
      await db.query(
        `SELECT data FROM "VisitorRecord" WHERE "eventId" = 'event' AND id = 'practice'`,
      )
    ).rows[0],
  ).toEqual({ data: { contact: 'preserved' } });
});
