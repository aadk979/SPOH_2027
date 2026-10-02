import { beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { ensureRecurring } from '../../src/platform/scheduler/ensureRecurring.js';
import { ScheduleRefusal } from '../../src/platform/scheduler/failure.js';
import { defineScheduledHandler } from '../../src/platform/scheduler/handler.js';
import { readSchedulerMetrics } from '../../src/platform/scheduler/metricsRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { startSchedulerWorker } from '../../src/platform/scheduler/startWorker.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const TYPE = 'test.maintenance';
const clock = fixedClock(FROZEN_NOW);
const handler = defineScheduledHandler({
  type: TYPE,
  schema: z.object({}).strict(),
  authorize: async ({ action }) => {
    if (action.createdByPersonId !== null) throw new ScheduleRefusal('SYSTEM_ONLY');
  },
  run: async () => {},
});
const registry = new HandlerRegistry([handler]);
const ensure = (eventId?: string) =>
  ensureRecurring({ registry, type: TYPE, intervalSeconds: 60, clock, eventId });
const claim = (instant: Date) =>
  claimDueActions({ workerId: 'boot-worker', types: registry.types(), clock: fixedClock(instant) });
beforeEach(resetDatabase);

it('concurrent instance boots seed one recurring action and do not postpone its due time on restart', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => ensure()));
  expect(new Set(results.map((entry) => entry.id)).size).toBe(1);
  const initial = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: results[0]!.id } });
  expect(initial).toMatchObject({
    eventId: null,
    createdByPersonId: null,
    payload: {},
    recurrence: 60,
    runAt: new Date(FROZEN_NOW.getTime() + 60_000),
    scheduledFor: new Date(FROZEN_NOW.getTime() + 60_000),
  });
  await ensureRecurring({
    registry,
    type: TYPE,
    intervalSeconds: 120,
    clock: fixedClock(new Date(FROZEN_NOW.getTime() + 1000)),
  });
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: initial.id } })).toEqual(
    initial,
  );
});

it('keeps platform and event recurrence separate', async () => {
  const { eventId } = await testEvent();
  const platform = await ensure();
  const event = await ensure(eventId);
  expect(platform.id).not.toBe(event.id);
  expect(await rawDb.scheduledAction.count()).toBe(2);
  expect((await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: event.id } })).eventId).toBe(
    eventId,
  );
});

it('the production worker composition claims, completes, audits and samples metrics on a manual tick', async () => {
  const action = await ensure();
  const worker = startSchedulerWorker({
    registry,
    workerId: 'composition-check',
    clock: fixedClock(new Date(FROZEN_NOW.getTime() + 60_000)),
  });
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
  expect((await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).status).toBe(
    'SUCCEEDED',
  );
  expect(
    await rawDb.auditLog.count({ where: { scheduledActionId: action.id, source: 'SCHEDULE' } }),
  ).toBe(1);
  expect(await rawDb.scheduledAction.count()).toBe(2);
});

it.each(['RUNNING', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
  'boot preserves existing %s status and lease/history',
  async (status) => {
    const action = await ensure();
    await rawDb.scheduledAction.update({
      where: { id: action.id },
      data: {
        status,
        attempts: 2,
        lastError: 'EXECUTION_FAILED',
        ...(status === 'RUNNING'
          ? { lockedBy: 'other-worker', lockedUntil: new Date(FROZEN_NOW.getTime() + 300_000) }
          : { completedAt: FROZEN_NOW }),
      },
    });
    const before = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(await ensure()).toEqual(action);
    expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).toEqual(
      before,
    );
    expect(await rawDb.scheduledAction.count()).toBe(1);
  },
);

it('boot racing successful completion still leaves exactly one successor', async () => {
  const seeded = await ensure();
  const due = new Date(FROZEN_NOW.getTime() + 60_000);
  const token = (await claim(due))[0]!;
  const [completed, ...boots] = await Promise.all([
    runClaimedAction({ claim: token, registry, clock: fixedClock(due) }),
    ...Array.from({ length: 8 }, () => ensure()),
  ]);
  expect(completed).toBe('SUCCEEDED');
  expect(boots).toHaveLength(8);
  const rows = await rawDb.scheduledAction.findMany({ where: { type: TYPE } });
  expect(rows).toHaveLength(2);
  expect(rows.find((entry) => entry.id === seeded.id)?.status).toBe('SUCCEEDED');
  expect(rows.filter((entry) => entry.dedupeKey !== null)).toEqual([
    expect.objectContaining({
      status: 'PENDING',
      runAt: new Date(FROZEN_NOW.getTime() + 120_000),
      attempts: 0,
    }),
  ]);
});

it('refuses unregistered types, invalid intervals and invalid stored payload before creating a seed', async () => {
  await expect(
    ensureRecurring({ registry, type: 'unknown', intervalSeconds: 60, clock }),
  ).rejects.toThrow('not registered');
  for (const intervalSeconds of [0, -1, 0.5, 2_147_483_648]) {
    await expect(ensureRecurring({ registry, type: TYPE, intervalSeconds, clock })).rejects.toThrow(
      'interval',
    );
  }
  await expect(
    ensureRecurring({
      registry,
      type: TYPE,
      intervalSeconds: 60,
      clock,
      payload: { secret: 'not a valid maintenance payload' },
    }),
  ).rejects.toThrow('INVALID_PAYLOAD');
  expect(await rawDb.scheduledAction.count()).toBe(0);
});

it('registers each handler type once and supports deliberate JSON-null system payloads', async () => {
  expect(() => new HandlerRegistry([handler, handler])).toThrow('Duplicate');
  const nullable = new HandlerRegistry([
    defineScheduledHandler({
      type: TYPE,
      schema: z.null(),
      authorize: async () => {},
      run: async () => {},
    }),
  ]);
  const result = await ensureRecurring({
    registry: nullable,
    type: TYPE,
    intervalSeconds: 60,
    clock,
    payload: null,
  });
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: result.id } })).payload,
  ).toBeNull();
});

it('reports original-deadline lag for eligible/reclaimable work and registered dead actions only', async () => {
  const create = (data = {}) =>
    rawDb.scheduledAction.create({ data: { type: TYPE, payload: {}, runAt: FROZEN_NOW, ...data } });
  await create({ scheduledFor: new Date(FROZEN_NOW.getTime() - 10_000) });
  await create({
    status: 'RUNNING',
    scheduledFor: new Date(FROZEN_NOW.getTime() - 40_000),
    lockedBy: 'crashed',
    lockedUntil: new Date(FROZEN_NOW.getTime() - 1),
  });
  await create({
    status: 'RUNNING',
    scheduledFor: new Date(FROZEN_NOW.getTime() - 500_000),
    lockedBy: 'busy',
    lockedUntil: new Date(FROZEN_NOW.getTime() + 1),
  });
  await create({
    runAt: new Date(FROZEN_NOW.getTime() + 1),
    scheduledFor: new Date(FROZEN_NOW.getTime() - 900_000),
  });
  await create({ type: 'unregistered', scheduledFor: new Date(FROZEN_NOW.getTime() - 1000_000) });
  for (const status of ['DEAD', 'FAILED', 'SUCCEEDED', 'CANCELLED'] as const)
    await create({ status, completedAt: FROZEN_NOW });
  await create({ status: 'DEAD', type: 'unregistered', completedAt: FROZEN_NOW });
  expect(await readSchedulerMetrics({ now: FROZEN_NOW, types: [TYPE] })).toEqual({
    schedulerLagSeconds: 40,
    schedulerDeadActions: 1,
  });
  expect(await readSchedulerMetrics({ now: FROZEN_NOW, types: [] })).toEqual({
    schedulerLagSeconds: 0,
    schedulerDeadActions: 0,
  });
});

it('event recurrence boot takes the Event lock before inserting/locking an action', async () => {
  const { eventId } = await testEvent();
  let boot: Promise<unknown> | undefined;
  try {
    await rawDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        boot = ensure(eventId);
        await expect
          .poll(async () => {
            const rows = await rawDb.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
            return Number(rows[0]!.count);
          })
          .toBeGreaterThan(0);
        expect(await tx.scheduledAction.count({ where: { eventId } })).toBe(0);
      },
      { timeout: 10_000 },
    );
  } finally {
    await boot;
  }
  expect(await rawDb.scheduledAction.count({ where: { eventId } })).toBe(1);
});
