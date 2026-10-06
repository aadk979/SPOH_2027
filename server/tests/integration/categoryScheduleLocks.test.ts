import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  CancelCategoryScheduleRequest,
  CreateCategoryScheduleRequest,
  UpdateCategoryScheduleRequest,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { registrationScheduledHandlers } from '../../src/modules/registration/index.js';
import {
  createCategorySchedule,
  updateCategorySchedule,
  cancelCategorySchedule,
  readCategory,
  readCategorySchedule,
  listCategorySchedules,
} from '../../src/modules/taxonomy/index.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
const registry = new HandlerRegistry(registrationScheduledHandlers);
let f: ScheduledLifecycleFixture;
let reviewed: { active: boolean; updatedAt: string };
const endpoint = () =>
  `/api/v1/events/${f.eventId}/admin/capture-categories/${f.categoryId}/schedules`;
const input = () =>
  CreateCategoryScheduleRequest.parse({
    active: false,
    expectedActive: reviewed.active,
    expectedUpdatedAt: reviewed.updatedAt,
    runAt: lifecycleAt(60_000).toISOString(),
    reason: 'Reviewed category lock test',
    idempotencyKey: randomUUID(),
  });
const editInput = () =>
  UpdateCategoryScheduleRequest.parse({
    ...input(),
    expectedScheduleVersion: 1,
    runAt: lifecycleAt(120_000).toISOString(),
    idempotencyKey: randomUUID(),
  });
const cancelInput = () =>
  CancelCategoryScheduleRequest.parse({
    expectedScheduleVersion: 1,
    reason: 'Cancel owned lock test',
    idempotencyKey: randomUUID(),
  });
const create = () =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(input());
const actor = (clock = fixedClock(lifecycleAt(0))) => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: {
    ...SYSTEM_AUDIT_CONTEXT,
    eventId: f.eventId,
    actorId: f.creator.id,
    actorSub: f.creator.sub,
    membershipId: f.membershipId,
  },
  clock,
});
const reservation = (key: string, endpointName: string) =>
  reserve(key, { endpoint: endpointName, actorSub: f.creator.sub, eventId: f.eventId });
type LockTable = 'Event' | 'EventMembership' | 'ScheduledAction' | 'IdempotencyRecord';

async function hold(
  table: LockTable,
  id: string,
  after: (tx: Prisma.TransactionClient) => Promise<void> = async () => {},
) {
  let unlock!: () => void;
  let announce!: () => void;
  const ready = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const transaction = rawDb.$transaction(
    async (tx) => {
      if (table === 'Event') await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`;
      else if (table === 'EventMembership')
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${id} FOR UPDATE`;
      else if (table === 'ScheduledAction')
        await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${id} FOR UPDATE`;
      announce();
      await gate;
      await after(tx);
    },
    { timeout: 20_000 },
  );
  await ready;
  return { unlock, transaction };
}
async function waitForLock(table: LockTable, mode: 'UPDATE' | 'SHARE') {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${`%FROM "${table}"%FOR ${mode}%`}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}
async function release(blocker: Awaited<ReturnType<typeof hold>>, pending: Promise<unknown>) {
  blocker.unlock();
  await blocker.transaction;
  await pending.catch(() => undefined);
}

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  const category = await rawDb.captureCategory.findUniqueOrThrow({ where: { id: f.categoryId } });
  reviewed = { active: category.active, updatedAt: category.updatedAt.toISOString() };
  await rawDb.setting.create({
    data: {
      scope: 'PLATFORM',
      scopeId: f.organisationId,
      eventId: null,
      key: 'rateLimit.max.admin',
      value: 500,
      version: 1,
    },
  });
});

it.each(['archive', 'authority', 'activity', 'timestamp', 'clock'] as const)(
  'rechecks %s after a real creation Event lock wait',
  async (change) => {
    const body = input();
    await reservation(body.idempotencyKey, 'taxonomy.category.schedule');
    let now = lifecycleAt(0);
    const blocker = await hold('Event', f.eventId, async (tx) => {
      if (change === 'archive')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
      else if (change === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { status: 'DEACTIVATED' },
        });
      else if (change === 'activity')
        await tx.captureCategory.update({
          where: { id: f.categoryId },
          data: { active: false, updatedAt: lifecycleAt(10_000) },
        });
      else if (change === 'timestamp')
        await tx.captureCategory.update({
          where: { id: f.categoryId },
          data: { updatedAt: new Date(Date.parse(reviewed.updatedAt) + 1) },
        });
      else now = lifecycleAt(90_000);
    });
    const pending = createCategorySchedule(
      { categoryId: f.categoryId, request: body },
      actor({ now: () => now }),
    );
    void pending.catch(() => undefined);
    try {
      await waitForLock('Event', 'UPDATE');
    } finally {
      await release(blocker, pending);
    }
    await expect(pending).rejects.toMatchObject({ statusCode: change === 'authority' ? 403 : 409 });
    expect(
      await rawDb.scheduledAction.count({
        where: { eventId: f.eventId, type: 'taxonomy.setActive' },
      }),
    ).toBe(0);
  },
);

it.each(['archive', 'authority', 'activity', 'timestamp', 'clock'] as const)(
  'rechecks %s after a real edit Event lock wait',
  async (change) => {
    const first = await create();
    expect(first.status).toBe(201);
    const body = editInput();
    await reservation(body.idempotencyKey, 'taxonomy.category.schedule.update');
    let now = lifecycleAt(0);
    const blocker = await hold('Event', f.eventId, async (tx) => {
      if (change === 'archive')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
      else if (change === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else if (change === 'activity')
        await tx.captureCategory.update({ where: { id: f.categoryId }, data: { active: false } });
      else if (change === 'timestamp')
        await tx.captureCategory.update({
          where: { id: f.categoryId },
          data: { updatedAt: new Date(Date.parse(reviewed.updatedAt) + 1) },
        });
      else now = lifecycleAt(180_000);
    });
    const pending = updateCategorySchedule(
      { categoryId: f.categoryId, id: first.body.schedule.id, request: body },
      actor({ now: () => now }),
    );
    void pending.catch(() => undefined);
    try {
      await waitForLock('Event', 'UPDATE');
    } finally {
      await release(blocker, pending);
    }
    await expect(pending).rejects.toMatchObject({ statusCode: change === 'authority' ? 403 : 409 });
    expect((await f.action(first.body.schedule.id)).version).toBe(1);
  },
);

it.each(['create', 'edit'] as const)(
  'rechecks deactivation after exact membership SHARE wait for %s',
  async (operation) => {
    const first = operation === 'edit' ? await create() : null;
    const body = operation === 'edit' ? editInput() : input();
    await reservation(
      body.idempotencyKey,
      operation === 'edit' ? 'taxonomy.category.schedule.update' : 'taxonomy.category.schedule',
    );
    const blocker = await hold('EventMembership', f.membershipId, async (tx) => {
      await tx.eventMembership.update({ where: { id: f.membershipId }, data: { status: 'ENDED' } });
    });
    const pending =
      operation === 'edit'
        ? updateCategorySchedule(
            {
              categoryId: f.categoryId,
              id: first!.body.schedule.id as string,
              request: UpdateCategoryScheduleRequest.parse(body),
            },
            actor(),
          )
        : createCategorySchedule(
            { categoryId: f.categoryId, request: CreateCategoryScheduleRequest.parse(body) },
            actor(),
          );
    void pending.catch(() => undefined);
    try {
      await waitForLock('EventMembership', 'SHARE');
    } finally {
      await release(blocker, pending);
    }
    await expect(pending).rejects.toMatchObject({ statusCode: 403 });
  },
);

it.each(['version', 'running', 'clock'] as const)(
  'rechecks %s after pending action UPDATE lock wait',
  async (change) => {
    const first = await create();
    const id: string = first.body.schedule.id;
    const body = editInput();
    await reservation(body.idempotencyKey, 'taxonomy.category.schedule.update');
    let now = lifecycleAt(0);
    const blocker = await hold('ScheduledAction', id, async (tx) => {
      if (change === 'version')
        await tx.scheduledAction.update({ where: { id }, data: { version: { increment: 1 } } });
      else if (change === 'running')
        await tx.scheduledAction.update({
          where: { id },
          data: {
            status: 'RUNNING',
            lockedBy: 'owned-synthetic-worker',
            lockedUntil: lifecycleAt(300_000),
          },
        });
      else now = lifecycleAt(180_000);
    });
    const pending = updateCategorySchedule(
      { categoryId: f.categoryId, id, request: body },
      actor({ now: () => now }),
    );
    void pending.catch(() => undefined);
    try {
      await waitForLock('ScheduledAction', 'UPDATE');
    } finally {
      await release(blocker, pending);
    }
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    expect(
      await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'schedule.update' } }),
    ).toBe(0);
  },
);

it('samples cancellation completion time after the action lock wait', async () => {
  const first = await create();
  const id: string = first.body.schedule.id;
  const body = cancelInput();
  await reservation(body.idempotencyKey, 'taxonomy.category.schedule.cancel');
  let now = lifecycleAt(0);
  const blocker = await hold('ScheduledAction', id, async () => {
    now = lifecycleAt(180_000);
  });
  const pending = cancelCategorySchedule(
    { categoryId: f.categoryId, id, request: body },
    actor({ now: () => now }),
  );
  try {
    await waitForLock('ScheduledAction', 'UPDATE');
  } finally {
    await release(blocker, pending);
  }
  expect((await pending).schedule).toMatchObject({
    status: 'CANCELLED',
    completedAt: lifecycleAt(180_000).toISOString(),
  });
});

it.each(['create', 'edit'] as const)(
  'refuses a newly due %s after the reservation lock wait',
  async (operation) => {
    const first = operation === 'edit' ? await create() : null;
    const body = operation === 'edit' ? editInput() : input();
    await reservation(
      body.idempotencyKey,
      operation === 'edit' ? 'taxonomy.category.schedule.update' : 'taxonomy.category.schedule',
    );
    let now = lifecycleAt(0);
    const blocker = await hold('IdempotencyRecord', body.idempotencyKey, async () => {
      now = lifecycleAt(180_000);
    });
    const pending =
      operation === 'edit'
        ? updateCategorySchedule(
            {
              categoryId: f.categoryId,
              id: first!.body.schedule.id as string,
              request: UpdateCategoryScheduleRequest.parse(body),
            },
            actor({ now: () => now }),
          )
        : createCategorySchedule(
            { categoryId: f.categoryId, request: CreateCategoryScheduleRequest.parse(body) },
            actor({ now: () => now }),
          );
    void pending.catch(() => undefined);
    try {
      await waitForLock('IdempotencyRecord', 'UPDATE');
    } finally {
      await release(blocker, pending);
    }
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
  },
);

it('an editor-held action lock excludes a worker claim and the old due instant', async () => {
  const first = await create();
  const id: string = first.body.schedule.id;
  const body = editInput();
  await reservation(body.idempotencyKey, 'taxonomy.category.schedule.update');
  const blocker = await hold('IdempotencyRecord', body.idempotencyKey);
  const pending = updateCategorySchedule({ categoryId: f.categoryId, id, request: body }, actor());
  try {
    await waitForLock('IdempotencyRecord', 'UPDATE');
    expect(
      await claimDueActions({
        types: registry.types(),
        workerId: 'editor-category-race',
        clock: fixedClock(lifecycleAt(60_000)),
      }),
    ).toEqual([]);
  } finally {
    await release(blocker, pending);
  }
  expect((await pending).schedule.version).toBe(2);
  expect(
    await claimDueActions({
      types: registry.types(),
      workerId: 'edited-category-old-due',
      clock: fixedClock(lifecycleAt(60_000)),
    }),
  ).toEqual([]);
  const due = await claimDueActions({
    types: registry.types(),
    workerId: 'edited-category-new-due',
    clock: fixedClock(lifecycleAt(120_000)),
  });
  expect(due).toHaveLength(1);
  expect(
    await runClaimedAction({ claim: due[0]!, registry, clock: fixedClock(lifecycleAt(120_000)) }),
  ).toBe('SUCCEEDED');
});

it('a claim that wins before editing/cancellation keeps the worker fence authoritative', async () => {
  const first = await create();
  const id: string = first.body.schedule.id;
  const due = await claimDueActions({
    types: registry.types(),
    workerId: 'claimed-category-first',
    clock: fixedClock(lifecycleAt(60_000)),
  });
  expect(due).toHaveLength(1);
  expect(
    (
      await request(app)
        .patch(`${endpoint()}/${id}`)
        .set('Authorization', bearer(f.creator))
        .send(editInput())
    ).status,
  ).toBe(409);
  expect(
    (
      await request(app)
        .post(`${endpoint()}/${id}/cancel`)
        .set('Authorization', bearer(f.creator))
        .send(cancelInput())
    ).status,
  ).toBe(409);
  expect(
    await runClaimedAction({ claim: due[0]!, registry, clock: fixedClock(lifecycleAt(60_000)) }),
  ).toBe('SUCCEEDED');
});

it.each(['category', 'schedule', 'list'] as const)(
  'returns fresh %s state/clock after Event SHARE wait',
  async (read) => {
    const first = await create();
    const id: string = first.body.schedule.id;
    let now = lifecycleAt(0);
    const blocker = await hold('Event', f.eventId, async (tx) => {
      await tx.captureCategory.update({
        where: { id: f.categoryId },
        data: { active: false, updatedAt: lifecycleAt(20_000) },
      });
      await tx.scheduledAction.update({
        where: { id },
        data: { status: 'CANCELLED', version: 2, completedAt: lifecycleAt(20_000) },
      });
      now = lifecycleAt(30_000);
    });
    const context = actor({ now: () => now });
    const pending =
      read === 'category'
        ? readCategory({ categoryId: f.categoryId }, context)
        : read === 'schedule'
          ? readCategorySchedule({ categoryId: f.categoryId, id }, context)
          : listCategorySchedules({ categoryId: f.categoryId, query: { limit: 20 } }, context);
    try {
      await waitForLock('Event', 'SHARE');
    } finally {
      await release(blocker, pending);
    }
    const result = await pending;
    if ('schedule' in result)
      expect(result).toMatchObject({
        schedule: { status: 'CANCELLED' },
        current: { evaluatedAt: now.toISOString(), data: { active: false } },
      });
    else if (Array.isArray(result.data))
      expect(result).toMatchObject({
        evaluatedAt: now.toISOString(),
        data: [expect.objectContaining({ status: 'CANCELLED' })],
      });
    else expect(result).toMatchObject({ evaluatedAt: now.toISOString(), data: { active: false } });
  },
);
