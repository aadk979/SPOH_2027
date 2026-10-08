import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readDefaultGrants } from '@spoh/access-policies/default-grants';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { applyClone, createEvent, planClone } from '../../src/modules/event/index.js';
import type { AuditContext } from '../../src/platform/audit/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { TEST_EVENT_TIMEZONE, testEvent } from '../helpers/fixtures.js';

/**
 * Per-event role grants (ADR-005 §2): the seed migration, new events and clones.
 * The migration file itself runs against the disposable test database.
 */
const SEED = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261008090100_seed_role_permissions/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

const REPEAT = readFileSync(
  fileURLToPath(
    new URL(
      '../../prisma/migrations/20261008110000_repeat_seed_role_permissions/migration.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

const SYSTEM: AuditContext = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: null,
};

/** `default-grants.json` as sorted `ROLE action` lines. */
const DEFAULTS = Object.entries(readDefaultGrants())
  .flatMap(([role, { grants }]) => grants.map((action) => `${role} ${action}`))
  .sort();

async function grantsOf(eventId: string): Promise<string[]> {
  const rows = await rawDb.rolePermission.findMany({ where: { eventId } });
  return rows.map(({ role, action }) => `${role} ${action}`).sort();
}

async function runSeed(sql = SEED): Promise<string[]> {
  if (new URL(env.DATABASE_URL).pathname !== '/spoh2027_test')
    throw new Error('the migration harness runs only against spoh2027_test');
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  const notices: string[] = [];
  client.on('notice', (notice) => notices.push(notice.message ?? ''));
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    return notices;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function secondEvent(): Promise<string> {
  const { eventId } = await testEvent();
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const created = await createEvent({
    organisationId: event.organisationId,
    slug: 'grants-second',
    name: 'Second Event',
    timezone: TEST_EVENT_TIMEZONE,
    categories: [{ code: 'OTHER', label: 'Other' }],
    stationTypes: [{ code: 'OTHER', label: 'Other' }],
    shiftTemplates: [{ code: 'DAY', label: 'Day', startLocal: '09:00', endLocal: '17:00' }],
  });
  return created.id;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('the approved defaults', () => {
  it('hold 156 grants and never grant VisitorRecord.Read', () => {
    expect(DEFAULTS).toHaveLength(156);
    expect(DEFAULTS.some((line) => line.endsWith(' VisitorRecord.Read'))).toBe(false);
  });
});

describe('the seed migration', () => {
  it('runs again in release B, byte for byte', () => {
    const body = (sql: string) => sql.slice(sql.indexOf('DO $$'));
    expect(body(REPEAT)).toBe(body(SEED));
  });

  it('catches an event the previous code created without grants', async () => {
    const { eventId } = await testEvent();
    const second = await secondEvent();
    await rawDb.rolePermission.deleteMany({ where: { eventId: second } });
    expect(await runSeed(REPEAT)).toContain('role grants seed: 156 row(s) for 1 event(s)');
    expect(await grantsOf(second)).toEqual(DEFAULTS);
    expect(await grantsOf(eventId)).toEqual(DEFAULTS);
  });

  it('gives every event without grants exactly the defaults', async () => {
    const { eventId } = await testEvent();
    const second = await secondEvent();
    await rawDb.rolePermission.deleteMany({});
    const notices = await runSeed();
    expect(await grantsOf(eventId)).toEqual(DEFAULTS);
    expect(await grantsOf(second)).toEqual(DEFAULTS);
    expect(notices).toContain('role grants seed: 312 row(s) for 2 event(s)');
  });

  it('leaves an event that has grants alone, and is re-runnable', async () => {
    const { eventId } = await testEvent();
    const second = await secondEvent();
    await rawDb.rolePermission.deleteMany({ where: { eventId: second } });
    await rawDb.rolePermission.deleteMany({
      where: { eventId, role: 'VOLUNTEER', action: 'Footfall.Create' },
    });
    const edited = await grantsOf(eventId);
    await runSeed();
    expect(await grantsOf(eventId)).toEqual(edited);
    expect(await grantsOf(second)).toEqual(DEFAULTS);
    expect(await runSeed()).toContain('role grants seed: every event already has grants');
    expect(await rawDb.rolePermission.count()).toBe(edited.length + DEFAULTS.length);
  });
});

describe('writers', () => {
  it('starts a new event from the defaults', async () => {
    const { eventId } = await testEvent();
    expect(await grantsOf(eventId)).toEqual(DEFAULTS);
  });

  it('copies the source’s grants into a clone, edits included', async () => {
    const source = await testEvent();
    await rawDb.rolePermission.deleteMany({
      where: { eventId: source.eventId, role: 'IC', action: 'Record.Void' },
    });
    const request = {
      slug: 'grants-clone',
      name: 'Clone',
      dayOffsetDays: 365,
      inviteSamePeople: false,
    };
    const clone = await applyClone(await planClone(source, request), { audit: SYSTEM });
    const copied = await grantsOf(clone.id);
    expect(copied).toEqual(await grantsOf(source.eventId));
    expect(copied).not.toContain('IC Record.Void');
  });

  it('starts a clone of an event without grants from the defaults', async () => {
    const source = await testEvent();
    await rawDb.rolePermission.deleteMany({ where: { eventId: source.eventId } });
    const request = {
      slug: 'grants-bare',
      name: 'Bare',
      dayOffsetDays: 365,
      inviteSamePeople: false,
    };
    const clone = await applyClone(await planClone(source, request), { audit: SYSTEM });
    expect(await grantsOf(clone.id)).toEqual(DEFAULTS);
  });
});
