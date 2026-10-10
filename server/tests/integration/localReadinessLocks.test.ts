import { beforeEach, expect, it } from 'vitest';
import { prisma } from '../../src/platform/db/client.js';
import { lockLifecycleEvent } from '../../src/modules/event/data/lifecycleRepo.js';
import { readGoLiveReadiness } from '../../src/modules/event/application/readGoLiveReadiness.js';
import { goLiveCheckBlockers } from '../../src/modules/event/domain/goLiveChecks.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  localReadinessFixture,
  readLocalReadiness,
  type LocalReadinessFixture,
} from '../helpers/localReadiness.js';
import { lifecycleAt, lifecycleNow, waitForLifecycleLock } from '../helpers/scheduledLifecycle.js';

let f: LocalReadinessFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await localReadinessFixture();
});

async function waitForReadLock(table: 'event' | 'membership') {
  await expect
    .poll(async () => {
      const pattern =
        table === 'event' ? '%FROM "Event"%FOR SHARE%' : '%FROM "EventMembership"%FOR SHARE%';
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
       AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it('observes all committed local facts and the clock after its Event lock wait', async () => {
  let now = lifecycleNow;
  let running: ReturnType<typeof readLocalReadiness> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    running = readLocalReadiness(f, { now: () => now });
    void running.catch(() => undefined);
    await waitForReadLock('event');
    now = lifecycleAt(60_000);
    await tx.shiftAssignment.delete({ where: { id: f.assignment.id } });
    await tx.captureCategory.update({ where: { id: f.categoryId }, data: { active: false } });
    await tx.missionCard.update({ where: { id: f.card.id }, data: { status: 'ISSUED' } });
    await tx.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 0 } });
    await tx.eventMembership.update({
      where: { id: f.rootMember.id },
      data: { role: 'VOLUNTEER' },
    });
  });
  const result = (await running)!;
  expect(result.evaluatedAt).toBe(now.toISOString());
  expect(result.items.filter((row) => row.state === 'failed').map((row) => row.code)).toEqual([
    'shift-coverage',
    'categories',
    'card-batch',
    'gift-stock',
    'attendance',
  ]);
});

it.each(['demoted', 'deactivated'])(
  'rejects the actor %s while waiting for its exact membership before reading facts',
  async (change) => {
    let running: ReturnType<typeof readLocalReadiness> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      running = readLocalReadiness(f);
      void running.catch(() => undefined);
      await waitForReadLock('membership');
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: 'DEACTIVATED' },
      });
    });
    await expect(running).rejects.toMatchObject({ statusCode: 403 });
  },
);

it('keeps a readiness read compatible with a concurrent capture Event SHARE lock', async () => {
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR SHARE`;
    expect(
      (await readLocalReadiness(f)).items.find((row) => row.code === 'gift-stock'),
    ).toMatchObject({ state: 'passed' });
  });
});

it('a lifecycle writer waits for input SHARE and reevaluates committed evidence', async () => {
  let running: ReturnType<typeof readGoLiveReadiness> | undefined;
  await rawDb.$transaction(async (writer) => {
    await writer.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR SHARE`;
    running = prisma.$transaction(async (tx) => {
      await lockLifecycleEvent(tx, { eventId: f.eventId });
      return readGoLiveReadiness(tx, { scope: { eventId: f.eventId }, now: lifecycleNow });
    });
    void running.catch(() => undefined);
    await waitForLifecycleLock();
    await writer.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 0 } });
  });
  const result = (await running)!;
  expect(result.items.find((row) => row.code === 'gift-stock')).toMatchObject({
    state: 'failed',
    reasons: ['live-gift-stock-empty'],
  });
  expect(goLiveCheckBlockers(result.checks, { platformAdmin: false })).toContain(
    'go-live:gift-stock',
  );
  expect(
    goLiveCheckBlockers(result.checks, {
      platformAdmin: true,
      goLiveOverrides: [{ code: 'gift-stock', reason: 'Reviewed stock' }],
    }),
  ).toContain('go-live:staging-smoke:missing');
});

it('never combines pre/post states of a coordinated commit in one evidence observation', async () => {
  const observations: Array<{ coverage: string; stock: string }> = [];
  const observe = async () => {
    const result = await readLocalReadiness(f);
    observations.push({
      coverage: result.items.find((row) => row.code === 'shift-coverage')!.state,
      stock: result.items.find((row) => row.code === 'gift-stock')!.state,
    });
  };
  await observe();
  let entered!: () => void;
  let release!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const coordinatedWriter = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR SHARE`;
    await tx.shiftAssignment.update({
      where: { id: f.assignment.id },
      data: { membershipId: null },
    });
    entered();
    await releasePromise;
    await tx.giftType.update({ where: { id: f.gift.id }, data: { initialStock: 0 } });
  });
  void coordinatedWriter.catch(() => undefined);
  await enteredPromise;
  await observe();
  const overlap = observe();
  release();
  await Promise.all([coordinatedWriter, overlap]);
  await observe();
  await Promise.all([
    (async () => {
      for (let i = 0; i < 12; i++)
        await rawDb.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR SHARE`;
          const passing = i % 2 === 1;
          await tx.shiftAssignment.update({
            where: { id: f.assignment.id },
            data: { membershipId: passing ? f.workerMember.id : null },
          });
          await tx.giftType.update({
            where: { id: f.gift.id },
            data: { initialStock: passing ? 10 : 0 },
          });
        });
    })(),
    (async () => {
      for (let i = 0; i < 12; i++) await observe();
    })(),
  ]);
  expect(observations).toHaveLength(16);
  expect(observations[0]).toEqual({ coverage: 'passed', stock: 'passed' });
  expect(observations[3]).toEqual({ coverage: 'failed', stock: 'failed' });
  for (const row of observations) expect(row.coverage).toBe(row.stock);
});
