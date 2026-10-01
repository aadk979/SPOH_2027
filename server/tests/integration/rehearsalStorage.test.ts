import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migration = '20261001150000_rehearsal_provenance';
const migrations = new URL('../../prisma/migrations/', import.meta.url);
const databaseName = 'spoh2027_rehearsal_migration_test';
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${databaseName}`;
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
let db: pg.Client;

const tables = [
  'Registration',
  'FootfallTick',
  'CardStampEvent',
  'GiftRedemption',
  'Incident',
  'LostPersonAlert',
  'LostFoundItem',
  'MissionCard',
  'LostPersonSummary',
  'Attendance',
  'AttendanceChallenge',
  'GiftStockAdjustment',
  'FallbackWindow',
  'ImportBatch',
];

async function manageDatabase(sql: string) {
  if (!databaseName.endsWith('_test')) throw new Error('scratch database must end in _test');
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

beforeAll(async () => {
  await manageDatabase(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await manageDatabase(`CREATE DATABASE ${databaseName}`);
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  for (const name of readdirSync(migrations)
    .filter((name) => name < migration)
    .sort()) {
    await db.query(readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8'));
  }
  await db.query(`
    INSERT INTO "Event" (id, "organisationId", slug, name, timezone, "updatedAt")
      VALUES ('event', 'org_sp_school_of_computing', 'migration', 'Migration', 'UTC', now());
    INSERT INTO "Person" (id, "cognitoSub", "displayName", email, "updatedAt")
      VALUES ('person', 'migration-person', 'Migration', 'migration@example.test', now());
    INSERT INTO "EventDay" (id, "eventId", date, label)
      VALUES ('day', 'event', '2026-10-01', 'Day');
    INSERT INTO "StationType" (id, "eventId", code, label, "updatedAt")
      VALUES ('type', 'event', 'type', 'Type', now());
    INSERT INTO "Station" (id, "eventId", "typeId", code, name)
      VALUES ('station', 'event', 'type', 'station', 'Station');
    INSERT INTO "CaptureCategory" (id, "eventId", code, label, "updatedAt")
      VALUES ('category', 'event', 'category', 'Category', now());
    INSERT INTO "MissionCard" (id, "eventId", "shortCode", "qrPayload", status)
      VALUES ('card', 'event', 'ABC234', 'migration-card', 'COMPLETED');
    INSERT INTO "GiftType" (id, "eventId", name, "initialStock")
      VALUES ('gift', 'event', 'Gift', 42);
    INSERT INTO "Registration" (id, "eventId", "categoryId", "stationId", "recordedById", "idempotencyKey")
      VALUES ('registration', 'event', 'category', 'station', 'person', 'registration');
    INSERT INTO "FootfallTick" (id, "eventId", "stationId", "recordedById", quantity, "idempotencyKey")
      VALUES ('footfall', 'event', 'station', 'person', 7, 'footfall');
    INSERT INTO "CardStampEvent" (id, "eventId", "missionCardId", "stationId", "recordedById", "idempotencyKey")
      VALUES ('stamp', 'event', 'card', 'station', 'person', 'stamp');
    INSERT INTO "GiftRedemption" (id, "eventId", "giftTypeId", "missionCardId", "stationId", "recordedById", "idempotencyKey")
      VALUES ('redemption', 'event', 'gift', 'card', 'station', 'person', 'redemption');
    INSERT INTO "LostPersonSummary" (id, "eventId", "raisedAt", "resolvedAt", "resolutionMinutes", outcome, "ackCount")
      VALUES ('summary', 'event', now(), now(), 12, 'RESOLVED_FOUND', 3);
    INSERT INTO "Attendance" (id, "eventId", "volunteerId", "eventDayId", method)
      VALUES ('attendance', 'event', 'person', 'day', 'QR');
    INSERT INTO "AttendanceChallenge" (id, "eventId", "issuerId", "eventDayId", "pinHash", "campusNetwork", "expiresAt")
      VALUES ('challenge', 'event', 'person', 'day', 'live-pin', true, now());
  `);
  await db.query(readFileSync(new URL(`${migration}/migration.sql`, migrations), 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.end();
  await manageDatabase(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

describe('rehearsal provenance migration', () => {
  it('adds non-null, false-default provenance to every capture and supporting table', async () => {
    const result = await db.query<{
      table_name: string;
      is_nullable: string;
      column_default: string;
    }>(`
      SELECT table_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'rehearsal' ORDER BY table_name`);
    expect(result.rows.map((row) => row.table_name)).toEqual([...tables].sort());
    expect(
      result.rows.every((row) => row.is_nullable === 'NO' && row.column_default === 'false'),
    ).toBe(true);
  });

  it('preserves existing counts, cards, stock, summaries and attendance as live', async () => {
    for (const table of [
      'Registration',
      'FootfallTick',
      'CardStampEvent',
      'GiftRedemption',
      'MissionCard',
      'LostPersonSummary',
      'Attendance',
      'AttendanceChallenge',
    ]) {
      const result = await db.query(`SELECT rehearsal FROM "${table}"`);
      expect(result.rows).toEqual([{ rehearsal: false }]);
    }
    expect((await db.query('SELECT quantity FROM "FootfallTick"')).rows).toEqual([{ quantity: 7 }]);
    expect((await db.query('SELECT status FROM "MissionCard"')).rows).toEqual([
      { status: 'COMPLETED' },
    ]);
    expect(
      (await db.query('SELECT "initialStock", "rehearsalInitialStock" FROM "GiftType"')).rows,
    ).toEqual([{ initialStock: 42, rehearsalInitialStock: 0 }]);
    expect(
      (await db.query('SELECT "resolutionMinutes", "ackCount" FROM "LostPersonSummary"')).rows,
    ).toEqual([{ resolutionMinutes: 12, ackCount: 3 }]);
  });

  it('allows practice attendance beside live attendance but refuses duplicates within each mode', async () => {
    const insert = `INSERT INTO "Attendance" (id, "eventId", "volunteerId", "eventDayId", method, rehearsal)
      VALUES ($1, 'event', 'person', 'day', 'QR', $2)`;
    await db.query(insert, ['practice-attendance', true]);
    await expect(db.query(insert, ['practice-duplicate', true])).rejects.toMatchObject({
      code: '23505',
    });
    await expect(db.query(insert, ['live-duplicate', false])).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('keeps practice and live attendance challenges separate', async () => {
    const insert = `INSERT INTO "AttendanceChallenge"
      (id, "eventId", "issuerId", "eventDayId", "pinHash", "campusNetwork", "expiresAt", rehearsal)
      VALUES ($1, 'event', 'person', 'day', $1, true, now(), $2)`;
    await db.query(insert, ['practice-challenge', true]);
    await expect(db.query(insert, ['practice-challenge-duplicate', true])).rejects.toMatchObject({
      code: '23505',
    });
    await expect(db.query(insert, ['live-challenge-duplicate', false])).rejects.toMatchObject({
      code: '23505',
    });
  });
});
