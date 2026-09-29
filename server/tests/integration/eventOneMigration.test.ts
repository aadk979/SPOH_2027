import { readFileSync } from 'node:fs';
import pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  createEventDayToday,
  createStation,
  createVolunteer,
} from '../helpers/fixtures.js';
// @ts-expect-error -- a plain ESM script without types; its check is what is under test.
import { checkEventOne } from '../../../remediation/reports/P09/totals.mjs';

/**
 * P09.4: today's data becomes Event #1, and the totals script finds no
 * difference between the old columns and the new ones. Legacy-shaped rows are
 * written first, as production has them, then the migration's SQL runs.
 */
const MIGRATION = readFileSync(
  new URL(
    '../../prisma/migrations/20260930030000_event_one_backfill/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

async function totals(): Promise<Array<{ name: string; ok: boolean; value: number }>> {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    return await checkEventOne(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  await resetDatabase();
  const day = await createEventDayToday();
  const booth = await createStation({ code: 'BOOTH', name: 'Sign-up booth' });
  await prisma.station.update({ where: { id: booth.id }, data: { kind: 'SIGNUP_BOOTH' } });
  const room = await createStation({ code: 'DCS_ROOM', countsEntry: true, issuesStamp: true });
  await prisma.station.update({
    where: { id: room.id },
    data: { kind: 'COURSE_STATION', courseCode: 'DCS' },
  });
  const done = await createStation({ code: 'DONE' });
  await prisma.station.update({ where: { id: done.id }, data: { kind: 'MISSION_COMPLETE' } });

  const chief = await createVolunteer({ email: 'chief@event1.test', role: 'CHIEF_COORDINATOR' });
  const ic = await createVolunteer({ email: 'ic@event1.test', role: 'IC' });
  const volunteer = await createVolunteer({ email: 'v@event1.test', role: 'VOLUNTEER' });
  await prisma.person.update({
    where: { id: volunteer.id },
    data: { reportsToId: ic.id, portfolio: 'Booth' },
  });
  await prisma.person.update({
    where: { id: chief.id },
    data: { active: false, deactivatedReason: 'test' },
  });
  await assignToStationAllBlocks({
    volunteerId: volunteer.id,
    stationId: booth.id,
    eventDayId: day.id,
  });

  const categories = ['SEC_3', 'SEC_3', 'SEC_4', 'PARENT_GUARDIAN'] as const;
  for (const [index, category] of categories.entries()) {
    await prisma.registration.create({
      data: {
        category,
        stationId: booth.id,
        recordedById: volunteer.id,
        idempotencyKey: `00000000-0000-4000-8000-00000000000${index}`,
      },
    });
  }
  await prisma.auditLog.create({
    data: { action: 'test.action', entityType: 'Test', actorId: ic.id },
  });

  await prisma.$executeRawUnsafe(MIGRATION);
});

describe('migrating into Event #1 (P09.4)', () => {
  it('finds no difference between the old columns and the new ones', async () => {
    const failures = (await totals()).filter((result) => !result.ok);
    expect(failures).toEqual([]);
  });

  it('creates the event, its taxonomy and a membership per volunteer', async () => {
    const event = await prisma.event.findFirstOrThrow({ include: { organisation: true } });
    expect(event).toMatchObject({ slug: 'spoh2027', timezone: 'Asia/Singapore', status: 'READY' });
    expect(event.organisation.appName).toBe('SPOH Ops');
    expect(await prisma.captureCategory.count()).toBe(8);
    expect(await prisma.shiftTemplate.count()).toBe(2);
    expect(await prisma.shift.count()).toBe(2);
    const types = await prisma.stationType.findMany({ orderBy: { code: 'asc' } });
    expect(types.map((type) => type.code)).toEqual([
      'COURSE_STATION_COUNTED_STAMPED',
      'MISSION_COMPLETE',
      'SIGNUP_BOOTH',
    ]);
    const memberships = await prisma.eventMembership.findMany({ orderBy: { role: 'asc' } });
    expect(memberships).toHaveLength(3);
    expect(memberships.find((m) => m.role === 'CHIEF_COORDINATOR')?.status).toBe('DEACTIVATED');
  });

  it('places a shift at the configured local time, in the event timezone', async () => {
    const morning = await prisma.shift.findFirstOrThrow({
      where: { template: { code: 'MORNING' } },
    });
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      minute: '2-digit',
    }).format(morning.startsAt);
    expect(local).toBe('09:30');
  });

  it('runs once: a second run changes nothing', async () => {
    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await prisma.event.count()).toBe(1);
    expect(await prisma.eventMembership.count()).toBe(3);
  });
});
