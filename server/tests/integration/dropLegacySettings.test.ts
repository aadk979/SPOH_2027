import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createLegacySettingsTable,
  dropLegacySettingsTable,
  insertLegacySetting,
  legacySettings,
} from '../helpers/legacySettings.js';

/**
 * Dropping the legacy settings store (P10.2 contract, D-18). The migration file
 * itself runs against the disposable test database, never a mocked copy of it.
 */
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261007170000_drop_app_setting/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

async function runMigration(): Promise<void> {
  if (new URL(env.DATABASE_URL).pathname !== '/spoh2027_test')
    throw new Error('the migration harness runs only against spoh2027_test');
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

const tableExists = async () =>
  (
    await rawDb.$queryRaw<[{ exists: boolean }]>`
      SELECT to_regclass('"AppSetting"') IS NOT NULL AS exists`
  )[0].exists;

beforeEach(async () => {
  await resetDatabase();
  await createLegacySettingsTable();
});
afterAll(() => dropLegacySettingsTable());

describe('legacy settings store drop migration', () => {
  it('drops the table when every row is a key an earlier migration accounted for', async () => {
    for (const [key, value] of [
      ['silentStationMinutes', 7],
      ['captureUndoWindowSeconds', 9],
      ['lostPersonPurgeHours', 12],
      ['refreshSessionDays', 14],
      ['eventName', 'A name the app never showed'],
    ] as const)
      await insertLegacySetting(key, value);
    await runMigration();
    expect(await tableExists()).toBe(false);
  });

  it('drops an empty table', async () => {
    await runMigration();
    expect(await tableExists()).toBe(false);
  });

  it('refuses a key nobody accounted for, and leaves the table and its rows', async () => {
    await insertLegacySetting('longShiftMinutes', 200);
    await insertLegacySetting('mysteryKey', 1);
    await expect(runMigration()).rejects.toThrow(/no migration accounted for: mysteryKey/);
    expect(await tableExists()).toBe(true);
    expect((await legacySettings()).map((row) => row.key)).toEqual([
      'longShiftMinutes',
      'mysteryKey',
    ]);
  });
});
