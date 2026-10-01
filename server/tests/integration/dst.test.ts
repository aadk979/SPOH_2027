import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { createEvent } from '../../src/modules/event/index.js';
import { addShiftsForDay } from '../../src/modules/eventDays/index.js';
import { generateReport } from '../../src/modules/report/application/generateReport.js';
import { prisma } from '../../src/platform/db/client.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { eventDaySql, localBucketStartSql } from '../../src/platform/db/zonedSql.js';
import { runningShifts } from '../../src/platform/event/runningShifts.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';

/**
 * P09.6: an event outside Singapore, on the days its clocks change (the F01
 * time audit's DST cases). Shifts are materialised in the event's zone, the
 * report buckets by its local days and hours, and none of it depends on the
 * database session's zone.
 *
 * Europe/London, 2027: clocks go forward at 01:00 GMT on 28 March and back at
 * 01:00 GMT (02:00 BST) on 31 October. The event's day starts at 04:00.
 */

let london: EventScope;

async function createLondonEvent(): Promise<EventScope> {
  await testEvent();
  const organisation = await rawDb.organisation.findUniqueOrThrow({
    where: { slug: 'test-organisation' },
  });
  const event = await createEvent({
    organisationId: organisation.id,
    slug: 'london-dst',
    name: 'London DST',
    timezone: 'Europe/London',
    dayBoundaryMinutes: 240,
    status: 'LIVE',
    categories: [{ code: 'SEC_1', label: 'Sec 1' }],
    stationTypes: [{ code: 'OTHER', label: 'Other' }],
    shiftTemplates: [
      { code: 'EARLY', label: 'Early', startLocal: '00:30', endLocal: '02:30' },
      { code: 'SHORT', label: 'Short', startLocal: '00:30', endLocal: '01:30' },
      {
        code: 'NIGHT',
        label: 'Night',
        startLocal: '22:00',
        endLocal: '02:00',
        endsNextDay: true,
      },
    ],
  });
  return { eventId: event.id };
}

async function addDay(scope: EventScope, date: string): Promise<void> {
  const day = await rawDb.eventDay.create({
    data: { eventId: scope.eventId, date: eventDayAnchor(date), label: date },
  });
  await addShiftsForDay(prisma, scope, { id: day.id, date });
}

async function shiftOn(date: string, template: string) {
  return rawDb.shift.findFirstOrThrow({
    where: {
      eventId: london.eventId,
      eventDay: { date: eventDayAnchor(date) },
      template: { code: template },
    },
    select: { startsAt: true, endsAt: true, template: { select: { code: true } } },
  });
}

/** Which templates are running at an instant, through the production filter. */
async function runningAt(iso: string): Promise<string[]> {
  const shifts = await rawDb.shift.findMany({
    where: { ...(await runningShifts(london, new Date(iso))), eventId: london.eventId },
    select: { template: { select: { code: true } } },
  });
  return shifts.map((shift) => shift.template.code).sort();
}

const iso = (date: Date) => date.toISOString();

beforeEach(async () => {
  await resetDatabase();
  london = await createLondonEvent();
  for (const date of ['2027-03-28', '2027-10-30', '2027-10-31']) await addDay(london, date);
});

describe('shifts across a DST transition (P09.6)', () => {
  it('shortens a shift across spring-forward by the lost hour (F01 case 2)', async () => {
    const early = await shiftOn('2027-03-28', 'EARLY');
    // 00:30 GMT to 02:30 BST: one real hour, not two.
    expect(iso(early.startsAt)).toBe('2027-03-28T00:30:00.000Z');
    expect(iso(early.endsAt)).toBe('2027-03-28T01:30:00.000Z');

    expect(await runningAt('2027-03-28T00:59:00Z')).toContain('EARLY');
    expect(await runningAt('2027-03-28T01:00:00Z')).toContain('EARLY'); // 02:00 BST
    expect(await runningAt('2027-03-28T01:30:00Z')).not.toContain('EARLY'); // 02:30 BST
  });

  it('reads an ambiguous end as its earlier occurrence, as ADR-007 rules (F01 case 3)', async () => {
    const short = await shiftOn('2027-10-31', 'SHORT');
    // 00:30 BST to the first 01:30 (BST): the rule is one rule for starts and
    // ends alike, so the shift is one hour, and closed by the repeated hour.
    expect(iso(short.startsAt)).toBe('2027-10-30T23:30:00.000Z');
    expect(iso(short.endsAt)).toBe('2027-10-31T00:30:00.000Z');

    expect(await runningAt('2027-10-30T23:30:00Z')).toContain('SHORT');
    expect(await runningAt('2027-10-31T00:15:00Z')).toContain('SHORT');
    expect(await runningAt('2027-10-31T00:45:00Z')).not.toContain('SHORT');
  });

  it('lengthens an overnight shift across fall-back by the repeated hour', async () => {
    const night = await shiftOn('2027-10-30', 'NIGHT');
    // 22:00 BST on the 30th to 02:00 GMT on the 31st: five real hours.
    expect(iso(night.startsAt)).toBe('2027-10-30T21:00:00.000Z');
    expect(iso(night.endsAt)).toBe('2027-10-31T02:00:00.000Z');
    expect(await runningAt('2027-10-31T01:30:00Z')).toContain('NIGHT');
  });
});

describe('the report on a DST day (P09.6)', () => {
  async function register(instants: string[]): Promise<void> {
    const person = await createVolunteer({ email: 'counter@dst.test', role: 'VOLUNTEER' });
    const type = await rawDb.stationType.create({
      data: { eventId: london.eventId, code: 'BOOTH', label: 'Booth', registersVisitors: true },
    });
    const station = await rawDb.station.create({
      data: { eventId: london.eventId, typeId: type.id, code: 'LDN-BOOTH', name: 'Booth' },
    });
    const category = await rawDb.captureCategory.findFirstOrThrow({
      where: { eventId: london.eventId, code: 'SEC_1' },
    });
    await rawDb.registration.createMany({
      data: instants.map((instant) => ({
        eventId: london.eventId,
        categoryId: category.id,
        stationId: station.id,
        recordedById: person.id,
        recordedAt: new Date(instant),
        idempotencyKey: randomUUID(),
      })),
    });
  }

  it('buckets days from the day boundary and keeps the repeated hour as two rows', async () => {
    await register([
      '2027-10-31T00:15:00Z', // 01:15 BST, the night of the 30th
      '2027-10-31T01:15:00Z', // 01:15 GMT, the same wall hour again
      '2027-10-31T02:30:00Z', // 02:30 GMT: before 04:00, still the 30th
      '2027-10-31T05:00:00Z', // 05:00 GMT: the 31st
    ]);

    const report = await generateReport(london, {});

    expect(report.timezone).toBe('Europe/London');
    expect(report.registrations.byDay).toEqual([
      { date: '2027-10-30', value: 3 },
      { date: '2027-10-31', value: 1 },
    ]);
    expect(report.registrations.byHour).toEqual([
      { hour: '2027-10-31T00:00:00.000Z', localHour: '2027-10-31 01:00 +01:00', value: 1 },
      { hour: '2027-10-31T01:00:00.000Z', localHour: '2027-10-31 01:00 +00:00', value: 1 },
      { hour: '2027-10-31T02:00:00.000Z', localHour: '2027-10-31 02:00', value: 1 },
      { hour: '2027-10-31T05:00:00.000Z', localHour: '2027-10-31 05:00', value: 1 },
    ]);
  });
});

describe('bucketing SQL (P09.6)', () => {
  /**
   * Runs one bucketing expression over one stored instant (a literal, so no
   * parameter binding is involved), with the session in a zone that is
   * neither UTC nor the event's (F01 case 12).
   */
  async function bucketOf(sql: Prisma.Sql, instant: string): Promise<string | undefined> {
    const stored = Prisma.raw(`TIMESTAMPTZ '${instant}'`);
    return rawDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Pacific/Auckland'`);
      const [row] = await tx.$queryRaw<Array<{ value: string }>>`
        SELECT to_char(${sql}, 'YYYY-MM-DD"T"HH24:MI') AS value
        FROM (SELECT ${stored} AS "recordedAt") AS t`;
      return row?.value;
    });
  }

  /** The same, for an instant expression: read back in UTC. */
  const utc = (sql: Prisma.Sql) => Prisma.sql`(${sql}) AT TIME ZONE 'UTC'`;

  it('starts an hour on the local hour at +05:30 (F01 case 6)', async () => {
    const hour = utc(localBucketStartSql('recordedAt', 'Asia/Kolkata', 60));
    expect(await bucketOf(hour, '2027-01-07T04:10:00Z')).toBe('2027-01-07T03:30');
  });

  it('starts a half hour on the local half hour at +05:45 (F01 case 7)', async () => {
    const halfHour = utc(localBucketStartSql('recordedAt', 'Asia/Kathmandu', 30));
    expect(await bucketOf(halfHour, '2027-01-07T04:20:00Z')).toBe('2027-01-07T04:15');
  });

  it('keeps the two occurrences of a repeated hour apart (F01 case 4)', async () => {
    const hour = utc(localBucketStartSql('recordedAt', 'Europe/London', 60));
    expect(await bucketOf(hour, '2027-10-31T00:15:00Z')).toBe('2027-10-31T00:00');
    expect(await bucketOf(hour, '2027-10-31T01:15:00Z')).toBe('2027-10-31T01:00');
  });

  it('dates by the event day whatever the session zone is (F01 cases 5 and 12)', async () => {
    const day = eventDaySql('recordedAt', { timezone: 'America/New_York', dayBoundaryMinutes: 0 });
    // New York's 23-hour day.
    expect(await bucketOf(day, '2027-03-15T03:59:00Z')).toBe('2027-03-14T00:00');
    expect(await bucketOf(day, '2027-03-15T04:00:00Z')).toBe('2027-03-15T00:00');
  });

  it("pins the application's sessions to UTC, which the driver adapter assumes", async () => {
    const [row] = await prisma.$queryRaw<Array<{ zone: string }>>`
      SELECT current_setting('TimeZone') AS zone`;
    expect(row?.zone).toBe('UTC');
  });
});
