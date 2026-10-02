import { beforeEach, expect, it } from 'vitest';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  lifecycleAt,
  lifecycleNow,
  lifecycleRegistry,
  scheduledLifecycleFixture,
  waitForLifecycleLock,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

let f: ScheduledLifecycleFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('serializes competing timed transitions to one lifecycle version and one transition receipt', async () => {
  await f.create({ to: 'READY' });
  await f.create({ to: 'READY' });
  const tokens = await f.claims();
  expect(tokens).toHaveLength(2);
  const results = await Promise.all(
    tokens.map((claim) =>
      runClaimedAction({ claim, registry: lifecycleRegistry, clock: fixedClock(lifecycleNow) }),
    ),
  );
  expect(results.sort()).toEqual(['FAILED', 'SUCCEEDED']);
  expect(await f.state()).toMatchObject({ status: 'READY', lifecycleVersion: 1 });
  expect(
    await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'event.transition' } }),
  ).toBe(1);
});

it('fresh stored payload and expected version are read after claiming', async () => {
  const row = await f.create({ to: 'READY' });
  const token = (await f.claims())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: row.id },
    data: { payload: { to: 'REHEARSAL', expectedVersion: 0 } },
  });
  expect(
    await runClaimedAction({
      claim: token,
      registry: lifecycleRegistry,
      clock: fixedClock(lifecycleNow),
    }),
  ).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  expect((await f.state()).status).toBe('DRAFT');
});

it.each(['permission', 'lifecycle version', 'structure'])(
  'sees a %s change committed while waiting for the Event lock',
  async (change) => {
    const row = await f.create({ to: 'READY' });
    const token = (await f.claims())[0]!;
    let running: Promise<unknown> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      running = runClaimedAction({
        claim: token,
        registry: lifecycleRegistry,
        clock: fixedClock(lifecycleNow),
      });
      await waitForLifecycleLock();
      if (change === 'permission')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      if (change === 'lifecycle version')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'READY' } });
      if (change === 'structure') await tx.eventDay.deleteMany({ where: { eventId: f.eventId } });
    });
    expect(await running).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe(
      change === 'permission' ? 'AUTHORITY_CHANGED' : 'GUARD_FAILED',
    );
  },
);

it('keeps the worker clock sampled after its Event wait for reopen expiry', async () => {
  await rawDb.event.update({
    where: { id: f.eventId },
    data: { status: 'CLOSED', closedAt: lifecycleNow },
  });
  await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  const beforeExpiry = lifecycleAt(48 * 3600_000 - 1);
  const row = await f.create(
    { to: 'LIVE', reason: 'Execution deadline verification' },
    { runAt: beforeExpiry },
  );
  const token = (await f.claims(beforeExpiry))[0]!;
  let instant = beforeExpiry;
  let running: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    running = runClaimedAction({
      claim: token,
      registry: lifecycleRegistry,
      clock: { now: () => instant },
    });
    await waitForLifecycleLock();
    instant = lifecycleAt(48 * 3600_000 + 1);
  });
  expect(await running).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  expect((await f.state()).status).toBe('CLOSED');
});

it('rechecks the current organisation role after an Event wait', async () => {
  await rawDb.event.update({
    where: { id: f.eventId },
    data: { status: 'CLOSED', closedAt: lifecycleNow },
  });
  const orgMember = await rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
  const row = await f.create({ to: 'LIVE', reason: 'Current organisation authority' });
  const token = (await f.claims())[0]!;
  let running: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    running = runClaimedAction({
      claim: token,
      registry: lifecycleRegistry,
      clock: fixedClock(lifecycleNow),
    });
    await waitForLifecycleLock();
    await tx.organisationMembership.update({
      where: { id: orgMember.id },
      data: { role: 'MEMBER' },
    });
  });
  expect(await running).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
});

it('refuses user recurrence before lifecycle effects', async () => {
  const row = await f.create(
    { to: 'READY' },
    { recurrence: 60, dedupeKey: 'unsupported-user-repeat' },
  );
  expect(await f.run()).toBe('FAILED');
  expect((await f.action(row.id)).lastError).toBe('SYSTEM_ONLY');
  expect((await f.state()).status).toBe('DRAFT');
});
