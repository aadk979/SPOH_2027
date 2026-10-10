import pg from 'pg';
import { beforeEach, expect, it } from 'vitest';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  lifecycleAt,
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

let f: ScheduledLifecycleFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('walks timed preparation edges, attributes current creator and commits state notifications', async () => {
  const listener = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  const notifications: unknown[] = [];
  listener.on('notification', (message) => notifications.push(JSON.parse(message.payload!)));
  try {
    await listener.query('LISTEN "event.state"');
    for (const [index, to] of ['READY', 'REHEARSAL', 'READY', 'DRAFT'].entries()) {
      const row = await f.create({ to, reason: 'Reviewed timed preparation' });
      expect(await f.run()).toBe('SUCCEEDED');
      expect(await f.state()).toMatchObject({ status: to, lifecycleVersion: index + 1 });
      const receipts = await f.receipts(row.id);
      expect(receipts.map((entry) => entry.action).sort()).toEqual([
        'event.transition',
        'schedule.execute',
      ]);
      expect(
        receipts.every(
          (entry) =>
            entry.eventId === f.eventId &&
            entry.actorId === f.creator.id &&
            entry.membershipId === f.membershipId &&
            entry.actorSub === f.creator.sub &&
            entry.source === 'SCHEDULE',
        ),
      ).toBe(true);
    }
    await expect.poll(() => notifications.length).toBe(4);
    expect(notifications).toEqual(
      ['READY', 'REHEARSAL', 'READY', 'DRAFT'].map((status, i) => ({
        eventId: f.eventId,
        status,
        version: i + 1,
      })),
    );
    expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(0);
  } finally {
    await listener.end();
  }
});

it('uses inclusive due time and closes only this event’s practice windows', async () => {
  await f.create({ to: 'READY' });
  await f.run();
  await f.create({ to: 'REHEARSAL' });
  await f.run();
  const practice = await f.window(true);
  const live = await f.window();
  const row = await f.create({ to: 'READY' }, { runAt: lifecycleAt(60_000) });
  expect(await f.claims(lifecycleAt(59_999))).toEqual([]);
  expect((await f.state()).status).toBe('REHEARSAL');
  expect(await f.run(lifecycleAt(60_000))).toBe('SUCCEEDED');
  expect(
    await rawDb.fallbackWindow.findUniqueOrThrow({ where: { id: practice.id } }),
  ).toMatchObject({
    endedAt: lifecycleAt(60_000),
  });
  expect(
    (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { id: live.id } })).endedAt,
  ).toBeNull();
  expect(
    (await f.receipts(row.id)).find((entry) => entry.action === 'event.transition')?.after,
  ).toMatchObject({
    effects: ['rehearsal.close'],
    closedWindows: [practice.id],
  });
});

it.each(['timezone', 'event-days', 'shift-templates', 'station-types', 'categories'])(
  'refuses current server structure missing %s without changing the event',
  async (missing) => {
    const row = await f.create({ to: 'READY' });
    if (missing === 'timezone')
      await rawDb.event.update({ where: { id: f.eventId }, data: { timezone: 'Invalid/Zone' } });
    if (missing === 'event-days')
      await rawDb.eventDay.deleteMany({ where: { eventId: f.eventId } });
    if (missing === 'shift-templates')
      await rawDb.shiftTemplate.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    if (missing === 'station-types')
      await rawDb.stationType.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    if (missing === 'categories')
      await rawDb.captureCategory.updateMany({
        where: { eventId: f.eventId },
        data: { active: false },
      });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
    expect(await f.state()).toMatchObject({ status: 'DRAFT', lifecycleVersion: 0 });
    expect((await f.receipts(row.id)).map((entry) => entry.action)).toEqual(['schedule.execute']);
  },
);

it.each([
  { to: 'ARCHIVED', platformAdmin: true },
  { to: 'READY', eventId: 'foreign-event' },
  { to: 'READY', readiness: { passed: true } },
  { to: 'READY', idempotencyKey: 'client-reservation' },
  { to: 'READY', expectedVersion: -1 },
  { to: 'READY', goLiveOverrides: [{ code: 'alarms', reason: 'Reviewed alarms' }] },
])('strictly refuses unsupported client evidence/input: %j', async (payload) => {
  const row = await f.create(payload);
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('INVALID_PAYLOAD');
  expect((await f.state()).status).toBe('DRAFT');
});

it.each(['DEACTIVATED', 'ENDED', 'demoted', 'missing'] as const)(
  'refuses current event authority %s',
  async (change) => {
    const row = await f.create({ to: 'READY' });
    if (change === 'missing') await rawDb.eventMembership.delete({ where: { id: f.membershipId } });
    else
      await rawDb.eventMembership.update({
        where: { id: f.membershipId },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: change },
      });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
    expect((await f.state()).status).toBe('DRAFT');
  },
);

it.each(['system', 'platform'])('refuses a %s-scoped user transition', async (kind) => {
  const row = await f.create(
    { to: 'READY' },
    kind === 'system' ? { createdByPersonId: null } : { eventId: null },
  );
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
});

it('does not waive an unavailable first-go-live checklist with platform overrides', async () => {
  await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  await f.create({ to: 'READY' });
  await f.run();
  const row = await f.create({
    to: 'LIVE',
    goLiveOverrides: [{ code: 'alarms', reason: 'Checked alarm' }],
  });
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  expect((await f.state()).status).toBe('READY');
});

it.each(['REHEARSAL', 'ARCHIVED'])(
  'rejects the illegal DRAFT → %s edge and returning a formerly live event to draft',
  async (to) => {
    const illegal = await f.create({ to });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(illegal.id)).lastError).toBe('GUARD_FAILED');
    await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
    await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
    await f.create({ to: 'DRAFT' });
    expect(await f.run()).toBe('FAILED');
    expect((await f.state()).hasBeenLive).toBe(true);
  },
);

it('the real API worker composition executes the registered lifecycle handler', async () => {
  const row = await f.create({ to: 'READY' });
  const worker = await startScheduledJobs(fixedClock(lifecycleNow));
  try {
    await worker.tick();
    expect((await f.action(row.id)).status).toBe('SUCCEEDED');
    expect((await f.state()).status).toBe('READY');
  } finally {
    await worker.stop();
  }
});
