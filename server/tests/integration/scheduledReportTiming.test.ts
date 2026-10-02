import { randomUUID } from 'node:crypto';
import { FullReport, nextDate } from '@spoh/shared';
import { beforeEach, expect, it } from 'vitest';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { waitForLifecycleLock } from '../helpers/scheduledLifecycle.js';
import {
  reportNow,
  reportRegistry,
  scheduledReportFixture,
  type ScheduledReportFixture,
} from '../helpers/scheduledReport.js';

let f: ScheduledReportFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledReportFixture();
});

it('only snapshots a completed operational day, including the inclusive end instant', async () => {
  const row = await f.create({}, { runAt: f.end });
  expect(await f.claims(new Date(f.end.getTime() - 1))).toEqual([]);
  expect(await f.run(f.end)).toBe('SUCCEEDED');
  expect((await f.action(row.id)).completedAt).toEqual(f.end);
  expect((await f.snapshots())[0]?.createdAt).toEqual(f.end);
});

it('refuses an action due before the day is complete rather than freezing partial daily data', async () => {
  const early = new Date(f.end.getTime() - 1);
  const row = await f.create({}, { runAt: early });
  expect(await f.run(early)).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  expect(await f.snapshots()).toEqual([]);
});

it.each([
  ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
  ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
])('uses the %s New York operational day’s actual DST bounds', async (date, from, to, hours) => {
  await rawDb.event.update({
    where: { id: f.eventId },
    data: { timezone: 'America/New_York', dayBoundaryMinutes: 0 },
  });
  await rawDb.eventDay.update({
    where: { id: f.dayId },
    data: { date: new Date(`${date}T00:00:00Z`) },
  });
  const instant = new Date(to!);
  await f.registration(false, new Date(from!));
  await f.registration(false, instant);
  await f.create({}, { runAt: instant });
  expect(await f.run(instant)).toBe('SUCCEEDED');
  const saved = FullReport.parse((await f.snapshots())[0]!.report);
  expect(saved.range).toEqual({ from, to });
  expect(saved.registrations.total).toBe(1);
  expect((new Date(to!).getTime() - new Date(from!).getTime()) / 3600_000).toBe(Number(hours));
});

it('refuses invalid current timezone configuration with a bounded guard code', async () => {
  const row = await f.create();
  await rawDb.event.update({ where: { id: f.eventId }, data: { timezone: 'Invalid/Zone' } });
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  expect(await f.snapshots()).toEqual([]);
});

it.each(['permission', 'clock configuration', 'day deletion'])(
  'observes %s committed during the Event wait',
  async (change) => {
    const row = await f.create();
    const token = (await f.claims())[0]!;
    let running: Promise<unknown> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      running = runClaimedAction({
        claim: token,
        registry: reportRegistry,
        clock: fixedClock(reportNow),
      });
      await waitForLifecycleLock();
      if (change === 'permission')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      if (change === 'clock configuration')
        await tx.event.update({
          where: { id: f.eventId },
          data: { timezone: 'UTC', dayBoundaryMinutes: 60 },
        });
      if (change === 'day deletion') await tx.eventDay.delete({ where: { id: f.dayId } });
    });
    expect(await running).toBe(change === 'clock configuration' ? 'SUCCEEDED' : 'FAILED');
    if (change === 'clock configuration') {
      expect(FullReport.parse((await f.snapshots())[0]!.report).range).toEqual({
        from: `${f.date}T01:00:00.000Z`,
        to: `${nextDate(f.date)}T01:00:00.000Z`,
      });
    } else {
      expect((await f.action(row.id)).lastError).toBe(
        change === 'permission' ? 'AUTHORITY_CHANGED' : 'TARGET_MISSING',
      );
      expect(await f.snapshots()).toEqual([]);
    }
  },
);

it('uses the current stored payload after claim', async () => {
  await f.registration();
  await f.registration(true);
  const row = await f.create();
  const token = (await f.claims())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: row.id },
    data: { payload: { kind: 'daily', eventDayId: f.dayId, includeRehearsal: true } },
  });
  expect(
    await runClaimedAction({
      claim: token,
      registry: reportRegistry,
      clock: fixedClock(reportNow),
    }),
  ).toBe('SUCCEEDED');
  expect(FullReport.parse((await f.snapshots())[0]!.report).registrations.total).toBe(2);
});

it('includes a capture committed while the daily report waits for its Event lock', async () => {
  await f.create();
  const token = (await f.claims())[0]!;
  let running: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR SHARE`;
    running = runClaimedAction({
      claim: token,
      registry: reportRegistry,
      clock: fixedClock(reportNow),
    });
    await waitForLifecycleLock();
    await tx.registration.create({
      data: {
        eventId: f.eventId,
        stationId: f.stationId,
        categoryId: f.categoryId,
        recordedById: f.creator.id,
        recordedAt: f.start,
        idempotencyKey: randomUUID(),
      },
    });
  });
  expect(await running).toBe('SUCCEEDED');
  expect(FullReport.parse((await f.snapshots())[0]!.report).registrations.total).toBe(1);
});

it('two executors of the same claim commit one snapshot and one completion', async () => {
  const row = await f.create();
  const claim = (await f.claims())[0]!;
  const results = await Promise.all(
    [1, 2].map(() =>
      runClaimedAction({ claim, registry: reportRegistry, clock: fixedClock(reportNow) }),
    ),
  );
  expect(results.sort()).toEqual(['STALE', 'SUCCEEDED']);
  expect(await f.snapshots()).toHaveLength(1);
  expect((await f.receipts(row.id)).map((entry) => entry.action).sort()).toEqual([
    'report.snapshot',
    'schedule.execute',
  ]);
});

it('refuses unsupported user recurrence without writing snapshots', async () => {
  const row = await f.create({}, { recurrence: 86400, dedupeKey: 'unsupported-daily-user-repeat' });
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('SYSTEM_ONLY');
  expect(await f.snapshots()).toEqual([]);
});
