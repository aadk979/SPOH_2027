import { beforeEach, expect, it } from 'vitest';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const TYPE = 'test.claim';
const clock = fixedClock(FROZEN_NOW);
const claim = (workerId: string, types = [TYPE], instant = FROZEN_NOW) =>
  claimDueActions({ workerId, types, clock: fixedClock(instant) });
const create = (data = {}) =>
  rawDb.scheduledAction.create({ data: { type: TYPE, payload: {}, runAt: FROZEN_NOW, ...data } });

beforeEach(resetDatabase);

it('claims at the due boundary, records the fence and leaves future/unregistered/terminal rows alone', async () => {
  const due = await create();
  const future = await create({ runAt: new Date(FROZEN_NOW.getTime() + 1) });
  const unsupported = await create({ type: 'event.archiveReminder' });
  for (const status of ['SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const) {
    await create({ status, completedAt: FROZEN_NOW });
  }
  const claims = await claimDueActions({ workerId: 'one', types: [TYPE], clock });
  expect(claims).toEqual([
    expect.objectContaining({
      id: due.id,
      eventId: null,
      attempts: 1,
      version: 2,
      lockedBy: 'one',
      lockedUntil: new Date(FROZEN_NOW.getTime() + 300_000),
      runAt: FROZEN_NOW,
      exhausted: false,
    }),
  ]);
  expect((await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: due.id } })).status).toBe(
    'RUNNING',
  );
  expect(await claim('two')).toEqual([]);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: future.id } })).attempts,
  ).toBe(0);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: unsupported.id } })).status,
  ).toBe('PENDING');
});

it('two workers share five-row batches without duplicate claims over repeated rounds', async () => {
  for (let round = 0; round < 8; round++) {
    await rawDb.scheduledAction.deleteMany();
    await rawDb.scheduledAction.createMany({
      data: Array.from({ length: 10 }, () => ({ type: TYPE, payload: {}, runAt: FROZEN_NOW })),
    });
    const [one, two] = await Promise.all([claim('one'), claim('two')]);
    expect(one).toHaveLength(5);
    expect(two).toHaveLength(5);
    expect(new Set([...one, ...two].map((row) => row.id)).size).toBe(10);
    expect(one.every((row) => row.lockedBy === 'one')).toBe(true);
    expect(two.every((row) => row.lockedBy === 'two')).toBe(true);
    expect((await rawDb.scheduledAction.findMany()).every((row) => row.attempts === 1)).toBe(true);
  }
});

it('reclaims only strictly expired leases and fences an older attempt even with the same worker ID', async () => {
  const action = await create();
  const first = (await claim('same-instance'))[0]!;
  const expiry = first.lockedUntil;
  expect(await claim('same-instance', [TYPE], expiry)).toEqual([]);
  const second = (await claim('same-instance', [TYPE], new Date(expiry.getTime() + 1)))[0]!;
  expect(second).toMatchObject({ id: action.id, attempts: 2, version: first.version + 1 });
  expect(second.lockedUntil.getTime() - expiry.getTime()).toBe(300_001);
});

it('skips a row locked by another claimant instead of waiting for it', async () => {
  const locked = await create({ runAt: new Date(FROZEN_NOW.getTime() - 1) });
  const available = await create();
  let release!: () => void;
  let signal!: () => void;
  const acquired = new Promise<void>((resolve) => {
    signal = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locker = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${locked.id} FOR UPDATE`;
    signal();
    await hold;
  });
  try {
    await acquired;
    expect((await claim('other')).map((row) => row.id)).toEqual([available.id]);
  } finally {
    release();
    await locker;
  }
  expect((await claim('later')).map((row) => row.id)).toEqual([locked.id]);
});

it('orders a limited batch by due time, preserving event and creator scope', async () => {
  const { eventId } = await testEvent();
  const creator = await createVolunteer({ email: 'creator@scheduler-claims.test', role: 'ADMIN' });
  const expected: string[] = [];
  for (let offset = 6; offset >= 1; offset--) {
    const row = await create({
      eventId,
      createdByPersonId: creator.id,
      runAt: new Date(FROZEN_NOW.getTime() - offset),
    });
    if (offset > 1) expected.push(row.id);
  }
  const rows = await claim('worker');
  expect(rows.map((row) => row.id).sort()).toEqual(expected.sort());
  expect(rows.every((row) => row.eventId === eventId)).toBe(true);
  expect(rows.every((row) => row.createdByPersonId === creator.id)).toBe(true);
  expect(await rawDb.scheduledAction.count({ where: { eventId, status: 'PENDING' } })).toBe(1);
});

it('recovers an exhausted crashed lease for dead-lettering without exceeding the stored attempt bound', async () => {
  const row = await create({ maxAttempts: 1 });
  const first = (await claim('crashed'))[0]!;
  expect(first).toMatchObject({ id: row.id, attempts: 1, exhausted: false });
  const recovered = (
    await claim('recovery', [TYPE], new Date(first.lockedUntil.getTime() + 1))
  )[0]!;
  expect(recovered).toMatchObject({ id: row.id, attempts: 1, exhausted: true, version: 3 });
});

it('empty catalogues do not claim and worker identifiers cannot be empty', async () => {
  await create();
  expect(await claim('worker', [])).toEqual([]);
  await expect(claim('  ')).rejects.toThrow('worker ID');
  expect(await rawDb.scheduledAction.count({ where: { status: 'PENDING' } })).toBe(1);
});
