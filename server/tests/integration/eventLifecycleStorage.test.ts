import { readFileSync, readdirSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openMigrationSchema, type MigrationSchema } from '../helpers/migrationSchema.js';

const target = '20261002020000_event_lifecycle_history';
const migrations = new URL('../../prisma/migrations/', import.meta.url);
let db: pg.Client;
let sandbox: MigrationSchema | undefined;
let schema: string;

beforeAll(async () => {
  sandbox = await openMigrationSchema();
  db = sandbox.db;
  schema = sandbox.schema;
  for (const name of readdirSync(migrations)
    .filter((name) => name < target)
    .sort()) {
    await sandbox.apply(readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8'));
  }
  await db.query(
    'INSERT INTO "Organisation" (id, slug, name, "appName", "defaultTimezone", "updatedAt") VALUES ($1,$1,$1,$1,$2,now())',
    ['lifecycle-org', 'Asia/Singapore'],
  );
  for (const status of ['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED']) {
    await db.query(
      'INSERT INTO "Event" (id, "organisationId", slug, name, timezone, status, "updatedAt") VALUES ($1,$2,$1,$1,$3,$4,now())',
      [`legacy-${status}`, 'lifecycle-org', 'Asia/Singapore', status],
    );
  }
  await sandbox.apply(readFileSync(new URL(`${target}/migration.sql`, migrations), 'utf8'));
});
afterAll(async () => {
  await sandbox?.close();
});

it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'])(
  'backfills observed live history for existing %s without changing phase',
  async (status) => {
    const result = await db.query(
      'SELECT status, "hasBeenLive", "lifecycleVersion" FROM "Event" WHERE id = $1',
      [`legacy-${status}`],
    );
    expect(result.rows[0]).toEqual({
      status,
      hasBeenLive: ['LIVE', 'CLOSED', 'ARCHIVED'].includes(status),
      lifecycleVersion: 0,
    });
  },
);

it('preserves live history and version through older phase writers and explicit reset attempts', async () => {
  await db.query('UPDATE "Event" SET status = $1 WHERE id = $2', ['LIVE', 'legacy-DRAFT']);
  await db.query(
    'UPDATE "Event" SET status = $1, "hasBeenLive" = false, "lifecycleVersion" = 0 WHERE id = $2',
    ['READY', 'legacy-DRAFT'],
  );
  expect(
    (
      await db.query(
        'SELECT status, "hasBeenLive", "lifecycleVersion" FROM "Event" WHERE id = $1',
        ['legacy-DRAFT'],
      )
    ).rows[0],
  ).toEqual({ status: 'READY', hasBeenLive: true, lifecycleVersion: 2 });
});

it('does not advance the lifecycle version for unrelated edits or no-op phase writes', async () => {
  await db.query(
    'UPDATE "Event" SET name = $1, status = $2, "lifecycleVersion" = 99 WHERE id = $3',
    ['Edited name', 'READY', 'legacy-DRAFT'],
  );
  expect(
    (
      await db.query('SELECT "hasBeenLive", "lifecycleVersion" FROM "Event" WHERE id = $1', [
        'legacy-DRAFT',
      ])
    ).rows[0],
  ).toEqual({ hasBeenLive: true, lifecycleVersion: 2 });
});

it.each(['DRAFT', 'LIVE'])(
  'supports older factory inserts into %s without the new fields',
  async (status) => {
    await db.query(
      'INSERT INTO "Event" (id, "organisationId", slug, name, timezone, status, "updatedAt") VALUES ($1,$2,$1,$1,$3,$4,now())',
      [`new-${status}`, 'lifecycle-org', 'Asia/Singapore', status],
    );
    expect(
      (
        await db.query('SELECT "hasBeenLive", "lifecycleVersion" FROM "Event" WHERE id = $1', [
          `new-${status}`,
        ])
      ).rows[0],
    ).toEqual({ hasBeenLive: status === 'LIVE', lifecycleVersion: 0 });
  },
);

it('requires both metadata fields with safe defaults for rolling writers', async () => {
  const columns = await db.query(
    'SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name IN ($3,$4)',
    [schema, 'Event', 'hasBeenLive', 'lifecycleVersion'],
  );
  expect(columns.rows).toEqual(
    expect.arrayContaining([
      { column_name: 'hasBeenLive', is_nullable: 'NO', column_default: 'false' },
      { column_name: 'lifecycleVersion', is_nullable: 'NO', column_default: '0' },
    ]),
  );
});
