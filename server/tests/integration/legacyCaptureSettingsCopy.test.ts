import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { changeSetting, resetSetting } from '../../src/platform/settings/change.js';
import { prepareNumericSettings } from '../../src/platform/settings/numericSnapshot.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';

/**
 * The legacy capture and outbox settings copy (P10.2). The migration file itself
 * runs against the disposable test database, never a mocked copy of it.
 */
const migration = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url)),
    'utf8',
  );
const SQL = migration('20261007090000_copy_capture_settings');
const THRESHOLD_SQL = migration('20261006090000_copy_threshold_settings');
const EVENT_ONE = 'evt_spoh2027';
const COPIED = [
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
] as const;
const audit = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: 'legacy-capture-copy',
};

function assertDisposableDatabase(): void {
  if (new URL(env.DATABASE_URL).pathname !== '/spoh2027_test')
    throw new Error('the migration harness runs only against spoh2027_test');
}

async function runMigration(sql = SQL): Promise<void> {
  assertDisposableDatabase();
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
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

const legacy = (key: string, value: unknown, updatedById: string | null = null) =>
  rawDb.appSetting.create({
    data: {
      key,
      value: value as never,
      updatedById,
      updatedAt: new Date('2026-09-01T01:02:03.000Z'),
    },
  });

const copiedRows = () =>
  rawDb.setting.findMany({ where: { scopeId: EVENT_ONE }, orderBy: { key: 'asc' } });
const copiedHistory = () =>
  rawDb.settingChange.findMany({ where: { scopeId: EVENT_ONE }, orderBy: { key: 'asc' } });

beforeEach(async () => {
  assertDisposableDatabase();
  await resetDatabase();
});
afterAll(async () => {
  await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_capture_copy ON "SettingChange"');
  await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_capture_copy()');
});

describe('legacy capture settings copy migration', () => {
  it('does nothing, and invents no event, when there is nothing to copy', async () => {
    await runMigration();
    expect(await rawDb.event.count()).toBe(0);
    expect(await rawDb.setting.count()).toBe(0);
    await legacy('lostPersonPurgeHours', 12);
    await legacy('silentStationMinutes', 7);
    await runMigration();
    expect(await rawDb.setting.count()).toBe(0);
  });

  it('refuses to guess a destination when Event #1 is missing, leaving the source intact', async () => {
    await testEvent();
    await legacy('outboxWarningCount', 30);
    await expect(runMigration()).rejects.toThrow(/evt_spoh2027 does not exist/);
    expect(await rawDb.setting.count()).toBe(0);
    expect(await rawDb.settingChange.count()).toBe(0);
    expect(await rawDb.appSetting.count()).toBe(1);
  });

  it('copies exactly the four keys at event scope with MIGRATION provenance', async () => {
    const event = await eventOne();
    const person = await createVolunteer({ email: 'copy@spoh.test', role: 'CHIEF_COORDINATOR' });
    await legacy('captureUndoWindowSeconds', 20, person.id);
    await legacy('captureSendGraceSeconds', 'not-a-number');
    await legacy('outboxWarningCount', 35);
    await legacy('outboxWarningAgeMinutes', 8);
    await legacy('silentStationMinutes', 7);
    await legacy('lostPersonPurgeHours', 12);
    await legacy('dashboardPollSeconds', 9);
    await legacy('eventName', 'Renamed legacy');
    await legacy('somethingUnknown', { a: 1 });
    const legacyBefore = await rawDb.appSetting.findMany({ orderBy: { key: 'asc' } });
    const [{ now: started }] = await rawDb.$queryRaw<[{ now: Date }]>`SELECT now() AS now`;

    await runMigration();

    const rows = await copiedRows();
    expect(rows.map((row) => row.key)).toEqual([...COPIED].sort());
    for (const row of rows) {
      expect(row).toMatchObject({
        scope: 'EVENT',
        scopeId: EVENT_ONE,
        eventId: EVENT_ONE,
        version: 1,
        updatedAt: new Date('2026-09-01T01:02:03.000Z'),
      });
    }
    expect(Object.fromEntries(rows.map((row) => [row.key, row.value]))).toEqual({
      captureSendGraceSeconds: 'not-a-number',
      captureUndoWindowSeconds: 20,
      outboxWarningAgeMinutes: 8,
      outboxWarningCount: 35,
    });
    expect(rows.find((row) => row.key === 'captureUndoWindowSeconds')?.updatedByPersonId).toBe(
      person.id,
    );
    expect(rows.find((row) => row.key === 'outboxWarningCount')?.updatedByPersonId).toBeNull();

    const history = await copiedHistory();
    expect(history).toHaveLength(rows.length);
    for (const change of history) {
      const row = rows.find((candidate) => candidate.key === change.key)!;
      expect(change).toMatchObject({
        scope: 'EVENT',
        scopeId: EVENT_ONE,
        eventId: EVENT_ONE,
        version: 1,
        before: null,
        after: row.value,
        source: 'MIGRATION',
        reason: 'Copied from the legacy runtime settings',
        actorPersonId: row.updatedByPersonId,
        scheduledActionId: null,
      });
      expect(change.createdAt.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1_000);
    }
    // No platform or station rows, nothing else copied, and the source is untouched.
    expect(await rawDb.setting.count()).toBe(rows.length);
    expect(await rawDb.setting.count({ where: { scope: { in: ['PLATFORM', 'STATION'] } } })).toBe(
      0,
    );
    expect(await rawDb.appSetting.findMany({ orderBy: { key: 'asc' } })).toEqual(legacyBefore);
    expect((await rawDb.event.findUniqueOrThrow({ where: { id: event.id } })).name).toBe(
      'SPOH 2027',
    );
  });

  it('runs after the threshold copy without touching what it copied', async () => {
    await eventOne();
    await legacy('silentStationMinutes', 7);
    await legacy('outboxWarningCount', 35);
    await runMigration(THRESHOLD_SQL);
    const thresholdRows = await copiedRows();
    const thresholdHistory = await copiedHistory();
    await runMigration();
    const rows = await copiedRows();
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ['outboxWarningCount', 35],
      ['silentStationMinutes', 7],
    ]);
    expect(rows.filter((row) => row.key === 'silentStationMinutes')).toEqual(thresholdRows);
    expect(
      (await copiedHistory()).filter((change) => change.key === 'silentStationMinutes'),
    ).toEqual(thresholdHistory);
  });

  it('keeps an invalid copied value as evidence while resolution falls through', async () => {
    await eventOne();
    await legacy('captureSendGraceSeconds', 'not-a-number');
    await legacy('outboxWarningCount', 0);
    await runMigration();
    expect((await copiedRows()).map((row) => row.value).sort()).toEqual([0, 'not-a-number']);
    const resolve = await prepareNumericSettings({ eventId: EVENT_ONE }, COPIED);
    expect(resolve('captureSendGraceSeconds')).toBe(2);
    expect(resolve('outboxWarningCount')).toBe(20);
  });

  it('is idempotent: a rerun adds no row and no history', async () => {
    await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await runMigration();
    const rows = await copiedRows();
    const history = await copiedHistory();
    await runMigration();
    await runMigration();
    expect(await copiedRows()).toEqual(rows);
    expect(await copiedHistory()).toEqual(history);
  });

  it('never overwrites a row written since, nor recreates a reset override', async () => {
    await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await changeSetting({
      target: { scope: 'event', eventId: EVENT_ONE },
      key: 'captureUndoWindowSeconds',
      value: 40,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    await changeSetting({
      target: { scope: 'event', eventId: EVENT_ONE },
      key: 'outboxWarningCount',
      value: 33,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    await resetSetting({
      target: { scope: 'event', eventId: EVENT_ONE },
      key: 'outboxWarningCount',
      expectedVersion: 1,
      actorPersonId: null,
      audit,
    });
    const touched = { key: { in: ['captureUndoWindowSeconds', 'outboxWarningCount'] } };
    const history = await rawDb.settingChange.findMany({
      where: touched,
      orderBy: [{ key: 'asc' }, { version: 'asc' }],
    });

    await runMigration();

    expect((await copiedRows()).map((row) => [row.key, row.value, row.version])).toEqual([
      ['captureSendGraceSeconds', 9, 1],
      ['captureUndoWindowSeconds', 40, 1],
      ['outboxWarningAgeMinutes', 9, 1],
    ]);
    expect(
      await rawDb.settingChange.findMany({
        where: touched,
        orderBy: [{ key: 'asc' }, { version: 'asc' }],
      }),
    ).toEqual(history);
    expect(await rawDb.settingChange.count({ where: { source: 'MIGRATION' } })).toBe(2);
  });

  it('leaves other events and organisations untouched', async () => {
    await eventOne();
    const { eventId } = await testEvent();
    await changeSetting({
      target: { scope: 'event', eventId },
      key: 'outboxWarningCount',
      value: 90,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    const before = await rawDb.setting.findMany({ where: { scopeId: eventId } });
    await legacy('outboxWarningCount', 200);
    await runMigration();
    expect(await rawDb.setting.findMany({ where: { scopeId: eventId } })).toEqual(before);
  });

  it('commits nothing when any part fails', async () => {
    await eventOne();
    for (const key of COPIED) await legacy(key, 9);
    await rawDb.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_capture_copy() RETURNS trigger AS $f$
      BEGIN
        IF NEW."key" = 'outboxWarningAgeMinutes' THEN RAISE EXCEPTION 'injected failure'; END IF;
        RETURN NEW;
      END $f$ LANGUAGE plpgsql`);
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER fail_capture_copy BEFORE INSERT ON "SettingChange" FOR EACH ROW EXECUTE FUNCTION fail_capture_copy()',
    );
    try {
      await expect(runMigration()).rejects.toThrow(/injected failure/);
      expect(await rawDb.setting.count()).toBe(0);
      expect(await rawDb.settingChange.count()).toBe(0);
    } finally {
      await rawDb.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_capture_copy ON "SettingChange"');
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_capture_copy()');
    }
    await runMigration();
    expect(await rawDb.setting.count()).toBe(4);
  });
});
