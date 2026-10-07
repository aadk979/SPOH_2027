import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { lostPersonRetentionHours } from '../../src/modules/lostPerson/application/retentionPolicy.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createLegacySettingsTable,
  dropLegacySettingsTable,
  insertLegacySetting,
  legacySettings,
} from '../helpers/legacySettings.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';

/**
 * The legacy lost-person retention copy (P10.2, D-16). The migration file itself
 * runs against the disposable test database, never a mocked copy of it.
 */
const SQL = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261007110000_copy_lost_person_retention/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);
const EVENT_ONE = 'evt_spoh2027';
const KEY = 'lostPersonPurgeHours';

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

async function eventOne() {
  await testEvent();
  const organisation = await rawDb.organisation.findFirstOrThrow({
    where: { slug: 'test-organisation' },
  });
  return rawDb.event.create({
    data: {
      id: EVENT_ONE,
      organisationId: organisation.id,
      slug: 'spoh2027-migration',
      name: 'SPOH 2027',
      timezone: 'Asia/Singapore',
    },
  });
}

const legacy = insertLegacySetting;
const rows = () =>
  rawDb.setting.findMany({ where: { scopeId: EVENT_ONE }, orderBy: { key: 'asc' } });
const history = () =>
  rawDb.settingChange.findMany({ where: { scopeId: EVENT_ONE }, orderBy: { version: 'asc' } });
const eventOneHours = async () => {
  const { organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: EVENT_ONE } });
  return prisma.$transaction((tx) =>
    lostPersonRetentionHours(tx, { eventId: EVENT_ONE, organisationId }),
  );
};

beforeEach(async () => {
  assertDisposableDatabase();
  await resetDatabase();
  await createLegacySettingsTable();
});
afterAll(async () => {
  await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_retention_copy ON "SettingChange"');
  await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_retention_copy()');
  await dropLegacySettingsTable();
});

describe('legacy lost-person retention copy migration', () => {
  it('does nothing, and invents no event, when there is nothing to copy', async () => {
    await runMigration();
    expect(await rawDb.event.count()).toBe(0);
    await legacy('alertPollSeconds', 12);
    await legacy('outboxWarningCount', 30);
    await runMigration();
    expect(await rawDb.setting.count()).toBe(0);
  });

  it('refuses to guess a destination when Event #1 is missing, leaving the source intact', async () => {
    await testEvent();
    await legacy(KEY, 12);
    await expect(runMigration()).rejects.toThrow(/evt_spoh2027 does not exist/);
    expect(await rawDb.setting.count()).toBe(0);
    expect(await rawDb.settingChange.count()).toBe(0);
    expect((await legacySettings()).length).toBe(1);
  });

  it('copies only this key at event scope with MIGRATION provenance', async () => {
    await eventOne();
    const person = await createVolunteer({ email: 'copy@spoh.test', role: 'CHIEF_COORDINATOR' });
    await legacy(KEY, 12, person.id);
    await legacy('alertPollSeconds', 12);
    await legacy('outboxWarningCount', 30);
    const legacyBefore = await legacySettings();

    await runMigration();

    expect(await rows()).toMatchObject([
      {
        id: `setmig_${EVENT_ONE}_${KEY}`,
        scope: 'EVENT',
        scopeId: EVENT_ONE,
        eventId: EVENT_ONE,
        key: KEY,
        value: 12,
        version: 1,
        updatedAt: new Date('2026-09-01T01:02:03.000Z'),
        updatedByPersonId: person.id,
      },
    ]);
    expect(await history()).toMatchObject([
      {
        key: KEY,
        version: 1,
        before: null,
        after: 12,
        source: 'MIGRATION',
        reason: 'Copied from the legacy runtime settings',
        actorPersonId: person.id,
      },
    ]);
    expect(await rawDb.setting.count()).toBe(1);
    expect(await legacySettings()).toEqual(legacyBefore);
    expect(await eventOneHours()).toBe(12);
  });

  it('keeps a value above the promise as evidence, and still purges at 24 hours', async () => {
    await eventOne();
    await legacy(KEY, 30);
    await runMigration();
    expect((await rows()).map((row) => row.value)).toEqual([30]);
    expect(await eventOneHours()).toBe(24);
  });

  it('is idempotent: a rerun adds no row and no history', async () => {
    await eventOne();
    await legacy(KEY, 6);
    await runMigration();
    const before = [await rows(), await history()];
    await runMigration();
    await runMigration();
    expect([await rows(), await history()]).toEqual(before);
  });

  it('never overwrites a value written since, nor recreates a reset one', async () => {
    await eventOne();
    await legacy(KEY, 6);
    await rawDb.settingChange.create({
      data: {
        scope: 'EVENT',
        scopeId: EVENT_ONE,
        eventId: EVENT_ONE,
        key: KEY,
        version: 1,
        before: 24,
        after: 24,
        source: 'RESET',
      },
    });
    await runMigration();
    expect(await rows()).toEqual([]);
    expect(await rawDb.settingChange.count({ where: { source: 'MIGRATION' } })).toBe(0);

    await rawDb.settingChange.deleteMany();
    await rawDb.setting.create({
      data: {
        scope: 'EVENT',
        scopeId: EVENT_ONE,
        eventId: EVENT_ONE,
        key: KEY,
        value: 3,
        version: 2,
      },
    });
    await runMigration();
    expect((await rows()).map((row) => [row.value, row.version])).toEqual([[3, 2]]);
    expect(await rawDb.settingChange.count({ where: { source: 'MIGRATION' } })).toBe(0);
  });

  it('commits nothing when any part fails', async () => {
    await eventOne();
    await legacy(KEY, 6);
    await rawDb.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_retention_copy() RETURNS trigger AS $f$
      BEGIN RAISE EXCEPTION 'injected failure'; END $f$ LANGUAGE plpgsql`);
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER fail_retention_copy BEFORE INSERT ON "SettingChange" FOR EACH ROW EXECUTE FUNCTION fail_retention_copy()',
    );
    try {
      await expect(runMigration()).rejects.toThrow(/injected failure/);
      expect(await rawDb.setting.count()).toBe(0);
      expect(await rawDb.settingChange.count()).toBe(0);
    } finally {
      await rawDb.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS fail_retention_copy ON "SettingChange"',
      );
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_retention_copy()');
    }
    await runMigration();
    expect(await rawDb.setting.count()).toBe(1);
  });
});
