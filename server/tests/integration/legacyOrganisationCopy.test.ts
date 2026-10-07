import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';

/**
 * The legacy organisation-wide settings copy (P10.2, D-17). The migration file
 * itself runs against the disposable test database, never a mocked copy of it.
 */
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261007130000_copy_organisation_settings/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const EVENT_ONE = 'evt_spoh2027';
const COPIED = [
  'alertPollSeconds',
  'dashboardPollSeconds',
  'idempotencyRetentionDays',
  'refreshSessionDays',
] as const;

function assertDisposableDatabase(): void {
  if (new URL(env.DATABASE_URL).pathname !== '/spoh2027_test')
    throw new Error('the migration harness runs only against spoh2027_test');
}

async function runMigration(): Promise<void> {
  assertDisposableDatabase();
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

/** Event #1 in the test organisation; returns that organisation's id. */
async function eventOne(): Promise<string> {
  await testEvent();
  const organisation = await rawDb.organisation.findFirstOrThrow({
    where: { slug: 'test-organisation' },
  });
  await rawDb.event.create({
    data: {
      id: EVENT_ONE,
      organisationId: organisation.id,
      slug: 'spoh2027-migration',
      name: 'SPOH 2027',
      timezone: 'Asia/Singapore',
    },
  });
  return organisation.id;
}

const legacy = (key: string, value: unknown, updatedById: string | null = null) =>
  rawDb.appSetting.create({
    data: {
      key,
      value: value as never,
      updatedById,
      updatedAt: new Date('2026-09-01T01:02:03.000Z'),
    },
  });
const platformRows = () =>
  rawDb.setting.findMany({ where: { scope: 'PLATFORM' }, orderBy: { key: 'asc' } });
const platformHistory = () =>
  rawDb.settingChange.findMany({ where: { scope: 'PLATFORM' }, orderBy: { key: 'asc' } });

beforeEach(async () => {
  assertDisposableDatabase();
  await resetDatabase();
});
afterAll(async () => {
  await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_org_copy ON "SettingChange"');
  await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_org_copy()');
});

describe('legacy organisation settings copy migration', () => {
  it('does nothing, and invents no event, when there is nothing to copy', async () => {
    await runMigration();
    expect(await rawDb.event.count()).toBe(0);
    await legacy('eventName', 'Renamed');
    await legacy('lostPersonPurgeHours', 12);
    await runMigration();
    expect(await rawDb.setting.count()).toBe(0);
  });

  it('refuses to guess a destination when Event #1 is missing, leaving the source intact', async () => {
    await testEvent();
    await legacy('refreshSessionDays', 7);
    await expect(runMigration()).rejects.toThrow(/evt_spoh2027 does not exist/);
    expect(await rawDb.setting.count()).toBe(0);
    expect(await rawDb.settingChange.count()).toBe(0);
    expect(await rawDb.appSetting.count()).toBe(1);
  });

  it("copies exactly the four keys to Event #1's organisation with MIGRATION provenance", async () => {
    const organisationId = await eventOne();
    const person = await createVolunteer({ email: 'copy@spoh.test', role: 'CHIEF_COORDINATOR' });
    await legacy('refreshSessionDays', 7, person.id);
    await legacy('alertPollSeconds', 12);
    await legacy('dashboardPollSeconds', 'often');
    await legacy('idempotencyRetentionDays', 3);
    await legacy('eventName', 'Renamed');
    await legacy('lostPersonPurgeHours', 12);
    const legacyBefore = await rawDb.appSetting.findMany({ orderBy: { key: 'asc' } });

    await runMigration();

    const rows = await platformRows();
    expect(rows.map((row) => row.key)).toEqual([...COPIED]);
    for (const row of rows)
      expect(row).toMatchObject({
        id: `setmig_org_${organisationId}_${row.key}`,
        scope: 'PLATFORM',
        scopeId: organisationId,
        eventId: null,
        version: 1,
        updatedAt: new Date('2026-09-01T01:02:03.000Z'),
      });
    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toEqual({
      alertPollSeconds: 12,
      dashboardPollSeconds: 'often',
      idempotencyRetentionDays: 3,
      refreshSessionDays: 7,
    });
    expect(rows.find((row) => row.key === 'refreshSessionDays')?.updatedByPersonId).toBe(person.id);
    const history = await platformHistory();
    expect(history).toHaveLength(4);
    for (const change of history)
      expect(change).toMatchObject({
        scope: 'PLATFORM',
        scopeId: organisationId,
        eventId: null,
        version: 1,
        before: null,
        source: 'MIGRATION',
        reason: 'Copied from the legacy runtime settings',
      });
    // Nothing at event or station scope, and the source is untouched.
    expect(await rawDb.setting.count()).toBe(4);
    expect(await rawDb.appSetting.findMany({ orderBy: { key: 'asc' } })).toEqual(legacyBefore);
  });

  it('is idempotent: a rerun adds no row and no history', async () => {
    await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await runMigration();
    const before = [await platformRows(), await platformHistory()];
    await runMigration();
    await runMigration();
    expect([await platformRows(), await platformHistory()]).toEqual(before);
  });

  it('never overwrites a value written since, nor recreates a reset one', async () => {
    const organisationId = await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await rawDb.setting.create({
      data: {
        scope: 'PLATFORM',
        scopeId: organisationId,
        eventId: null,
        key: 'refreshSessionDays',
        value: 3,
        version: 2,
      },
    });
    await rawDb.settingChange.create({
      data: {
        scope: 'PLATFORM',
        scopeId: organisationId,
        eventId: null,
        key: 'alertPollSeconds',
        version: 1,
        before: 10,
        after: 10,
        source: 'RESET',
      },
    });
    await runMigration();
    expect((await platformRows()).map((row) => [row.key, row.value, row.version])).toEqual([
      ['dashboardPollSeconds', 9, 1],
      ['idempotencyRetentionDays', 9, 1],
      ['refreshSessionDays', 3, 2],
    ]);
    expect(await rawDb.settingChange.count({ where: { source: 'MIGRATION' } })).toBe(2);
  });

  it('commits nothing when any part fails', async () => {
    await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await rawDb.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_org_copy() RETURNS trigger AS $f$
      BEGIN
        IF NEW."key" = 'refreshSessionDays' THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW;
      END $f$ LANGUAGE plpgsql`);
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER fail_org_copy BEFORE INSERT ON "SettingChange" FOR EACH ROW EXECUTE FUNCTION fail_org_copy()',
    );
    try {
      await expect(runMigration()).rejects.toThrow(/injected failure/);
      expect(await rawDb.setting.count()).toBe(0);
      expect(await rawDb.settingChange.count()).toBe(0);
    } finally {
      await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_org_copy ON "SettingChange"');
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_org_copy()');
    }
    await runMigration();
    expect(await rawDb.setting.count()).toBe(4);
  });
});
