import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { createEvent } from '../../src/modules/event/index.js';
import { registrationScheduledHandlers } from '../../src/modules/registration/index.js';
import * as activity from '../../src/modules/registration/application/setCategoryActive.js';
import * as categories from '../../src/modules/registration/data/repo.js';
import * as audit from '../../src/platform/audit/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as execution from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const now = FROZEN_NOW;
const at = (offset: number) => new Date(now.getTime() + offset);
const registry = new HandlerRegistry(registrationScheduledHandlers);
let eventId: string;
let categoryId: string;
let stationId: string;
let creator: TestVolunteer;
let membershipId: string;
let fixtureNumber = 0;
const payload = (data = {}) => ({ kind: 'category', id: categoryId, active: false, ...data });
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'taxonomy.setActive',
      payload: payload(),
      runAt: now,
      createdByPersonId: creator.id,
      ...data,
    },
  });
const claims = (instant = now) =>
  claimDueActions({
    workerId: 'category-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
const run = async (instant = now) =>
  runClaimedAction({ claim: (await claims(instant))[0]!, registry, clock: fixedClock(instant) });
const action = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
const category = () => rawDb.captureCategory.findUniqueOrThrow({ where: { id: categoryId } });
const receipts = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
const tap = () =>
  request(app)
    .post(`/api/v1/events/${eventId}/registrations`)
    .set('Authorization', bearer(creator))
    .send({ stationId, category: 'SEC_4', idempotencyKey: idempotencyKey() });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  creator = await createVolunteer({
    email: `scheduled-category-${fixtureNumber++}@test.example`,
    role: 'ADMIN',
  });
  stationId = (await createStation({ code: 'TIMED-CATEGORY' })).id;
  membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: creator.id } })
  ).id;
  categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId, code: 'SEC_4' } }))
    .id;
});

it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED'] as const)(
  'sets an absolute category state in %s and attributes both receipts',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    const before = await category();
    const row = await create();
    expect(await run()).toBe('SUCCEEDED');
    expect(await category()).toEqual({ ...before, active: false, updatedAt: now });
    const records = await receipts(row.id);
    expect(records.map((entry) => entry.action).sort()).toEqual([
      'category.setActive',
      'schedule.execute',
    ]);
    expect(
      records.every(
        (entry) =>
          entry.source === 'SCHEDULE' &&
          entry.eventId === eventId &&
          entry.actorId === creator.id &&
          entry.actorSub === creator.sub &&
          entry.membershipId === membershipId,
      ),
    ).toBe(true);
    expect(records.find((entry) => entry.action === 'category.setActive')).toMatchObject({
      entityId: categoryId,
      before: { active: true },
      after: { active: false },
    });
  },
);

it('time travel pauses/resumes capture at inclusive due boundaries and keeps report history', async () => {
  expect((await tap()).status).toBe(201);
  await create({ runAt: at(60_000) });
  await create({ runAt: at(120_000), payload: payload({ active: true }) });
  expect(await claims(at(59_999))).toEqual([]);
  expect(await run(at(60_000))).toBe('SUCCEEDED');
  expect((await tap()).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
  const report = await request(app)
    .get(`/api/v1/events/${eventId}/reports/summary`)
    .set('Authorization', bearer(creator));
  expect(report.status).toBe(200);
  expect(report.body.registrations.byCategory).toEqual(
    expect.arrayContaining([expect.objectContaining({ key: 'SEC_4', value: 1 })]),
  );
  expect(await claims(at(119_999))).toEqual([]);
  expect(await run(at(120_000))).toBe('SUCCEEDED');
  expect((await tap()).status).toBe(201);
});

it('a no-op completes with an outcome receipt without editing the category or fabricating a change', async () => {
  const before = await category();
  const row = await create({ payload: payload({ active: true }) });
  expect(await run()).toBe('SUCCEEDED');
  expect(await category()).toEqual(before);
  expect((await receipts(row.id)).map((entry) => entry.action)).toEqual(['schedule.execute']);
});

it.each(['DEACTIVATED', 'ENDED', 'demoted', 'missing'] as const)(
  'rechecks current creator authority: %s',
  async (change) => {
    const row = await create();
    if (change === 'missing') await rawDb.eventMembership.delete({ where: { id: membershipId } });
    else
      await rawDb.eventMembership.update({
        where: { id: membershipId },
        data: change === 'demoted' ? { role: 'VOLUNTEER' } : { status: change },
      });
    expect(await run()).toBe('FAILED');
    expect((await action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
    expect((await category()).active).toBe(true);
    expect((await receipts(row.id))[0]).toMatchObject({ outcome: 'DENIED' });
  },
);

it.each(['system creator', 'platform action', 'missing category', 'archived', 'recurring user'])(
  'refuses unsafe scope or lifecycle: %s',
  async (kind) => {
    const row = await create(
      kind === 'system creator'
        ? { createdByPersonId: null }
        : kind === 'platform action'
          ? { eventId: null }
          : kind === 'missing category'
            ? { payload: payload({ id: 'missing-category' }) }
            : kind === 'recurring user'
              ? { recurrence: 60, dedupeKey: 'unsafe-category' }
              : {},
    );
    if (kind === 'archived')
      await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    expect(await run()).toBe('FAILED');
    expect((await action(row.id)).lastError).toBe(
      kind === 'archived'
        ? 'GUARD_FAILED'
        : kind === 'missing category'
          ? 'TARGET_MISSING'
          : kind === 'recurring user'
            ? 'SYSTEM_ONLY'
            : 'AUTHORITY_CHANGED',
    );
    expect((await category()).active).toBe(true);
  },
);

it.each([
  { kind: 'station' },
  { kind: 'stationType' },
  { eventId: 'foreign' },
  { active: 'false' },
  { active: null },
  { active: undefined },
  { id: '' },
  { clientReadiness: true },
])('rejects unsupported taxonomy input %j', async (value) => {
  const row = await create({ payload: payload(value) });
  expect(await run()).toBe('FAILED');
  expect((await action(row.id)).lastError).toBe('INVALID_PAYLOAD');
  expect((await category()).active).toBe(true);
});

it('refuses a real foreign-event category without changing either event', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const foreign = await createEvent({
    organisationId: event.organisationId,
    slug: 'foreign-category',
    name: 'Other',
    timezone: 'UTC',
    categories: [{ code: 'OTHER', label: 'Other' }],
    stationTypes: [],
    shiftTemplates: [],
  });
  const target = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId: foreign.id } });
  const row = await create({ payload: payload({ id: target.id }) });
  expect(await run()).toBe('FAILED');
  expect((await action(row.id)).lastError).toBe('TARGET_MISSING');
  expect((await rawDb.captureCategory.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(
    true,
  );
  expect((await category()).active).toBe(true);
});

it('uses the current stored payload after claiming', async () => {
  const row = await create();
  const claim = (await claims())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: row.id },
    data: { payload: payload({ active: true }) },
  });
  expect(await runClaimedAction({ claim, registry, clock: fixedClock(now) })).toBe('SUCCEEDED');
  expect((await category()).active).toBe(true);
});

it.each(['handler', 'module audit', 'completion', 'outcome audit'])(
  'rolls activity and its audit back on %s failure, then retries cleanly',
  async (stage) => {
    const row = await create();
    const before = await category();
    const original = activity.setCategoryActive;
    const originalAudit = audit.writeAudit;
    const spy =
      stage === 'handler'
        ? vi.spyOn(activity, 'setCategoryActive').mockImplementationOnce(async (...args) => {
            await original(...args);
            throw new Error('private category fault');
          })
        : stage === 'module audit'
          ? vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('private category fault'))
          : stage === 'completion'
            ? vi
                .spyOn(execution, 'finishAction')
                .mockRejectedValueOnce(new Error('private category fault'))
            : vi
                .spyOn(audit, 'writeAudit')
                .mockImplementationOnce(originalAudit)
                .mockRejectedValueOnce(new Error('private category fault'));
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await category()).toEqual(before);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'category.setActive' } })).toBe(
      0,
    );
    const pending = await action(row.id);
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(JSON.stringify(await receipts(row.id))).not.toContain('private category fault');
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect((await category()).active).toBe(false);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'category.setActive' } })).toBe(
      1,
    );
  },
);

it('two executors of one claim produce one change and one successful outcome', async () => {
  const row = await create();
  const claim = (await claims())[0]!;
  expect(
    (
      await Promise.all([
        runClaimedAction({ claim, registry, clock: fixedClock(now) }),
        runClaimedAction({ claim, registry, clock: fixedClock(now) }),
      ])
    ).sort(),
  ).toEqual(['STALE', 'SUCCEEDED']);
  expect((await receipts(row.id)).map((entry) => entry.action).sort()).toEqual([
    'category.setActive',
    'schedule.execute',
  ]);
});

async function waitForEventLock(mode: 'UPDATE' | 'CAPTURE_RESERVATION') {
  const query = mode === 'UPDATE' ? '%FROM "Event"%FOR UPDATE%' : '%INSERT INTO%IdempotencyRecord%';
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${query}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it('sees an authority change committed while waiting for the Event lock', async () => {
  const row = await create();
  const claim = (await claims())[0]!;
  let running: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id=${eventId} FOR UPDATE`;
    running = runClaimedAction({ claim, registry, clock: fixedClock(now) });
    await waitForEventLock('UPDATE');
    await tx.eventMembership.update({ where: { id: membershipId }, data: { role: 'VOLUNTEER' } });
  });
  expect(await running).toBe('FAILED');
  expect((await action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
  expect((await category()).active).toBe(true);
});

it('a waiting tap sees the worker deactivation only after its atomic completion', async () => {
  await create();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = false;
  const original = activity.setCategoryActive;
  const spy = vi.spyOn(activity, 'setCategoryActive').mockImplementationOnce(async (...args) => {
    await original(...args);
    entered = true;
    await gate;
  });
  const running = run();
  let capture: Promise<request.Response> | undefined;
  try {
    await expect.poll(() => entered).toBe(true);
    capture = tap().then((response) => response);
    await waitForEventLock('CAPTURE_RESERVATION');
    expect((await category()).active).toBe(true);
  } finally {
    release();
    await running;
    spy.mockRestore();
  }
  expect((await capture)?.status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
});

it('the worker waits for an admitted tap and refuses subsequent capture', async () => {
  await create();
  let entered = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = categories.findCategory;
  const spy = vi.spyOn(categories, 'findCategory').mockImplementationOnce(async (...args) => {
    const row = await original(...args);
    entered = true;
    await gate;
    return row;
  });
  const capture = tap().then((response) => response);
  let running: Promise<unknown> | undefined;
  try {
    await expect.poll(() => entered).toBe(true);
    running = run();
    await waitForEventLock('UPDATE');
  } finally {
    release();
    await capture;
    if (running) await running;
    spy.mockRestore();
  }
  expect((await capture).status).toBe(201);
  expect((await category()).active).toBe(false);
  expect((await tap()).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('the real API worker registers and applies category activity', async () => {
  const row = await create();
  const worker = await startScheduledJobs(fixedClock(now));
  try {
    await worker.tick();
    expect((await action(row.id)).status).toBe('SUCCEEDED');
    expect((await tap()).status).toBe(409);
  } finally {
    await worker.stop();
  }
});
