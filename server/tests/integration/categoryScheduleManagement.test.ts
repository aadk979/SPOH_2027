import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  CategoryScheduleListResponse,
  CategoryScheduleResponse,
  type ScheduledActionStatus,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { registrationScheduledHandlers } from '../../src/modules/registration/index.js';
import * as audit from '../../src/platform/audit/index.js';
import * as replay from '../../src/platform/idempotency/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
const registry = new HandlerRegistry(registrationScheduledHandlers);
function storedStatus(status: ScheduledActionStatus) {
  if (status === 'RUNNING')
    return {
      status,
      lockedBy: 'owned-synthetic-worker',
      lockedUntil: lifecycleAt(300_000),
      completedAt: null,
    };
  return {
    status,
    lockedBy: null,
    lockedUntil: null,
    completedAt: status === 'PENDING' ? null : lifecycleAt(0),
  };
}
let f: ScheduledLifecycleFixture;
let reviewed: { active: boolean; updatedAt: string };
const endpoint = (categoryId = f.categoryId) =>
  `/api/v1/events/${f.eventId}/admin/capture-categories/${categoryId}/schedules`;
const input = (patch = {}) => ({
  active: false,
  expectedActive: reviewed.active,
  expectedUpdatedAt: reviewed.updatedAt,
  reason: 'Reviewed initial category action',
  runAt: lifecycleAt(60_000).toISOString(),
  idempotencyKey: randomUUID(),
  ...patch,
});
const updateInput = (patch = {}) => ({
  ...input({
    reason: 'Reviewed edited category action',
    runAt: lifecycleAt(120_000).toISOString(),
  }),
  expectedScheduleVersion: 1,
  ...patch,
});
const cancelInput = (patch = {}) => ({
  expectedScheduleVersion: 1,
  reason: 'Cancel reviewed pending category action',
  idempotencyKey: randomUUID(),
  ...patch,
});
const create = (body = input()) =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
const edit = (id: string, body = updateInput()) =>
  request(app).patch(`${endpoint()}/${id}`).set('Authorization', bearer(f.creator)).send(body);
const cancel = (id: string, body = cancelInput()) =>
  request(app)
    .post(`${endpoint()}/${id}/cancel`)
    .set('Authorization', bearer(f.creator))
    .send(body);
const list = (query = '') =>
  request(app).get(`${endpoint()}${query}`).set('Authorization', bearer(f.creator));
const category = () => rawDb.captureCategory.findUniqueOrThrow({ where: { id: f.categoryId } });
const mutations = () =>
  Promise.all([
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'schedule.update' } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'schedule.cancel' } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'category.setActive' } }),
  ]);
const member = async () => {
  const manager = await createVolunteer({
    email: 'current-category-manager@test.example',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: manager.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  return manager;
};
const run = async (now: Date) => {
  const claims = await claimDueActions({
    types: registry.types(),
    workerId: 'category-management-test',
    clock: fixedClock(now),
  });
  expect(claims).toHaveLength(1);
  return runClaimedAction({ claim: claims[0]!, registry, clock: fixedClock(now) });
};

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  const snapshot = await category();
  reviewed = { active: snapshot.active, updatedAt: snapshot.updatedAt.toISOString() };
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

it('lists exact category work with bounded attribution and no raw worker or identity fields', async () => {
  const first = await create();
  expect(first.status).toBe(201);
  const response = await list();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const page = CategoryScheduleListResponse.parse(response.body);
  expect(page).toMatchObject({
    eventId: f.eventId,
    categoryId: f.categoryId,
    meta: { count: 1, nextCursor: null },
  });
  expect(page.data[0]).toMatchObject({
    categoryId: f.categoryId,
    createdByYou: true,
    reason: 'Reviewed initial category action',
  });
  for (const privateValue of [
    f.creator.id,
    f.creator.sub,
    f.membershipId,
    'payload',
    'lockedBy',
    'lockedUntil',
    'dedupeKey',
    'actorId',
  ])
    expect(JSON.stringify(response.body)).not.toContain(privateValue);
});

it.each(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
  'lists and filters %s status without returning raw errors',
  async (status) => {
    const first = await create();
    await rawDb.scheduledAction.update({
      where: { id: first.body.schedule.id },
      data: { ...storedStatus(status), lastError: 'private worker diagnostic' },
    });
    const page = CategoryScheduleListResponse.parse((await list(`?status=${status}`)).body);
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({ status, lastError: 'EXECUTION_FAILED' });
    const otherStatus = status === 'PENDING' ? 'CANCELLED' : 'PENDING';
    expect((await list(`?status=${otherStatus}`)).body.data).toEqual([]);
  },
);

it('keeps category/status pagination bounded when the cursor changes status', async () => {
  for (let index = 0; index < 3; index++) expect((await create()).status).toBe(201);
  const first = CategoryScheduleListResponse.parse((await list('?status=PENDING&limit=1')).body);
  expect(first.meta.nextCursor).toBe(first.data[0]!.id);
  await rawDb.scheduledAction.update({
    where: { id: first.data[0]!.id },
    data: storedStatus('CANCELLED'),
  });
  const next = CategoryScheduleListResponse.parse(
    (await list(`?status=PENDING&limit=1&cursor=${first.meta.nextCursor}`)).body,
  );
  expect(next.data).toHaveLength(1);
  expect(next.data[0]!.id).not.toBe(first.data[0]!.id);
  const last = CategoryScheduleListResponse.parse(
    (await list(`?status=PENDING&limit=1&cursor=${next.meta.nextCursor}`)).body,
  );
  expect(last.data).toHaveLength(1);
  expect(last.meta.nextCursor).toBeNull();
});

it('moves both due instants and atomically records an edit without applying category state', async () => {
  const before = await category();
  const first = await create();
  const body = updateInput({ active: true });
  const edited = await edit(first.body.schedule.id, body);
  expect(edited.status).toBe(200);
  expect(CategoryScheduleResponse.parse(edited.body).schedule).toMatchObject({
    status: 'PENDING',
    version: 2,
    active: true,
    scheduledFor: lifecycleAt(120_000).toISOString(),
    runAt: lifecycleAt(120_000).toISOString(),
    attempts: 0,
  });
  expect(await category()).toEqual(before);
  expect((await f.action(first.body.schedule.id)).payload).toEqual({
    kind: 'category',
    id: f.categoryId,
    active: true,
  });
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
      .responseBody,
  ).toEqual({
    scheduledActionId: first.body.schedule.id,
    categoryId: f.categoryId,
    mutationVersion: 2,
  });
  expect(await mutations()).toEqual([1, 0, 0]);
  const entry = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId: f.eventId, action: 'schedule.update' },
  });
  expect(entry).toMatchObject({
    source: 'USER',
    actorId: f.creator.id,
    membershipId: f.membershipId,
    after: { version: 2, intent: { categoryId: f.categoryId, active: true } },
  });
});

it('executes only the edited definition at the new due boundary', async () => {
  const first = await create();
  expect((await edit(first.body.schedule.id)).status).toBe(200);
  expect(
    await claimDueActions({
      types: registry.types(),
      workerId: 'old-category-due',
      clock: fixedClock(lifecycleAt(60_000)),
    }),
  ).toEqual([]);
  expect((await category()).active).toBe(true);
  expect(await run(lifecycleAt(120_000))).toBe('SUCCEEDED');
  expect((await category()).active).toBe(false);
  expect((await list()).body.data[0]).toMatchObject({
    status: 'SUCCEEDED',
    version: 4,
    reason: 'Reviewed edited category action',
  });
});

it('permits two reviewed absolute instructions to pause then restore without a due-time snapshot guard', async () => {
  const first = await create();
  const second = await create(
    input({
      active: true,
      runAt: lifecycleAt(120_000).toISOString(),
      reason: 'Reviewed restoration of original category activity',
    }),
  );
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(await run(lifecycleAt(60_000))).toBe('SUCCEEDED');
  expect((await category()).active).toBe(false);
  expect(await run(lifecycleAt(120_000))).toBe('SUCCEEDED');
  expect((await category()).active).toBe(true);
  expect(await mutations()).toEqual([0, 0, 2]);
});

it('cancels pending work, binds a replay receipt and prevents worker admission without changing category', async () => {
  const before = await category();
  const first = await create();
  const body = cancelInput();
  const stopped = await cancel(first.body.schedule.id, body);
  expect(stopped.status).toBe(200);
  expect(stopped.body.schedule).toMatchObject({
    status: 'CANCELLED',
    version: 2,
    attempts: 0,
    completedAt: lifecycleAt(0).toISOString(),
  });
  expect((await cancel(first.body.schedule.id, body)).status).toBe(200);
  expect(await category()).toEqual(before);
  expect(
    await claimDueActions({
      types: registry.types(),
      workerId: 'cancelled-category',
      clock: fixedClock(lifecycleAt(120_000)),
    }),
  ).toEqual([]);
  expect(await mutations()).toEqual([0, 1, 0]);
});

it('cancellation does not require an unchanged category snapshot or future scheduled instant', async () => {
  const first = await create();
  await rawDb.captureCategory.update({
    where: { id: f.categoryId },
    data: { active: false, updatedAt: lifecycleAt(10_000) },
  });
  await rawDb.scheduledAction.update({
    where: { id: first.body.schedule.id },
    data: { runAt: lifecycleAt(-1), scheduledFor: lifecycleAt(-1) },
  });
  // Change the matching audited definition with the synthetic stored instant; execution payload stays strict.
  const entry = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId: f.eventId, action: 'schedule.create' },
  });
  const original = entry.after as { version: 1; intent: object };
  await rawDb.auditLog.update({
    where: { id: entry.id },
    data: {
      after: { ...original, intent: { ...original.intent, runAt: lifecycleAt(-1).toISOString() } },
    },
  });
  expect((await cancel(first.body.schedule.id)).status).toBe(200);
  expect((await category()).active).toBe(false);
  expect(await mutations()).toEqual([0, 1, 0]);
});

it('another current manager can read/cancel but cannot edit the creator definition', async () => {
  const first = await create();
  const other = await member();
  const headers = { Authorization: bearer(other) };
  expect((await request(app).get(endpoint()).set(headers)).body.data[0].createdByYou).toBe(false);
  expect(
    (
      await request(app)
        .patch(`${endpoint()}/${first.body.schedule.id}`)
        .set(headers)
        .send(updateInput())
    ).status,
  ).toBe(404);
  const stopped = await request(app)
    .post(`${endpoint()}/${first.body.schedule.id}/cancel`)
    .set(headers)
    .send(cancelInput());
  expect(stopped.status).toBe(200);
  expect((await f.action(first.body.schedule.id)).createdByPersonId).toBe(f.creator.id);
  expect(
    (
      await rawDb.auditLog.findFirstOrThrow({
        where: { eventId: f.eventId, action: 'schedule.cancel' },
      })
    ).actorId,
  ).toBe(other.id);
});

it('returns current status and category values when an old edit replays after later edits/cancel/archive', async () => {
  const first = await create();
  const body = updateInput();
  const id = first.body.schedule.id;
  expect((await edit(id, body)).status).toBe(200);
  expect(
    (
      await edit(
        id,
        updateInput({
          expectedScheduleVersion: 2,
          active: true,
          runAt: lifecycleAt(180_000).toISOString(),
        }),
      )
    ).status,
  ).toBe(200);
  expect((await edit(id, body)).body.schedule).toMatchObject({ version: 3, active: true });
  expect((await cancel(id, cancelInput({ expectedScheduleVersion: 3 }))).status).toBe(200);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  await rawDb.captureCategory.update({ where: { id: f.categoryId }, data: { active: false } });
  const replayed = await edit(id, body);
  expect(replayed.status).toBe(200);
  expect(replayed.body.schedule).toMatchObject({ version: 4, status: 'CANCELLED', active: true });
  expect(replayed.body.current).toMatchObject({ eventStatus: 'ARCHIVED', data: { active: false } });
  expect((await edit(id, updateInput({ expectedScheduleVersion: 4 }))).status).toBe(409);
});

it.each([
  { active: true },
  { expectedActive: false },
  { reason: 'Altered edit reason' },
  { runAt: lifecycleAt(180_000).toISOString() },
  { expectedScheduleVersion: 2 },
])('rejects altered successful edit replay %j', async (patch) => {
  const first = await create();
  const body = updateInput();
  expect((await edit(first.body.schedule.id, body)).status).toBe(200);
  const rejected = await edit(first.body.schedule.id, { ...body, ...patch });
  expect(rejected.status).toBe(409);
  expect(rejected.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  expect(await mutations()).toEqual([1, 0, 0]);
});

it('binds cancellation receipt to reason, path, actor and operation', async () => {
  const first = await create();
  const second = await create();
  const body = cancelInput();
  expect((await cancel(first.body.schedule.id, body)).status).toBe(200);
  expect(
    (await cancel(first.body.schedule.id, { ...body, reason: 'Changed cancellation' })).status,
  ).toBe(409);
  expect((await cancel(second.body.schedule.id, body)).status).toBe(409);
  expect(
    (await edit(first.body.schedule.id, updateInput({ idempotencyKey: body.idempotencyKey })))
      .status,
  ).toBe(409);
  const other = await member();
  expect(
    (
      await request(app)
        .post(`${endpoint()}/${first.body.schedule.id}/cancel`)
        .set('Authorization', bearer(other))
        .send(body)
    ).status,
  ).toBe(409);
  const otherCategory = await rawDb.captureCategory.create({
    data: { eventId: f.eventId, code: 'OTHER', label: 'Other' },
  });
  expect(
    (
      await request(app)
        .post(`${endpoint(otherCategory.id)}/${first.body.schedule.id}/cancel`)
        .set('Authorization', bearer(f.creator))
        .send(body)
    ).status,
  ).toBe(409);
});

it.each(['RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
  'never edits or cancels %s work',
  async (status) => {
    const first = await create();
    await rawDb.scheduledAction.update({
      where: { id: first.body.schedule.id },
      data: storedStatus(status),
    });
    expect((await edit(first.body.schedule.id)).status).toBe(409);
    expect((await cancel(first.body.schedule.id)).status).toBe(409);
    expect(await mutations()).toEqual([0, 0, 0]);
  },
);

it('keeps retry attempts/max attempts and last error through a pending edit', async () => {
  const first = await create();
  await rawDb.scheduledAction.update({
    where: { id: first.body.schedule.id },
    data: {
      attempts: 3,
      maxAttempts: 5,
      lastError: 'EXECUTION_FAILED',
      runAt: lifecycleAt(90_000),
      version: 4,
    },
  });
  const edited = await edit(first.body.schedule.id, updateInput({ expectedScheduleVersion: 4 }));
  expect(edited.status).toBe(200);
  expect(edited.body.schedule).toMatchObject({
    version: 5,
    attempts: 3,
    maxAttempts: 5,
    lastError: 'EXECUTION_FAILED',
  });
});

it('refuses stale action/category snapshots and nonfuture edits, while stale cancellation remains harmless', async () => {
  const first = await create();
  for (const patch of [
    { expectedScheduleVersion: 2 },
    { expectedActive: false },
    { expectedUpdatedAt: new Date(Date.parse(reviewed.updatedAt) + 1).toISOString() },
    { runAt: lifecycleAt(0).toISOString() },
  ])
    expect((await edit(first.body.schedule.id, updateInput(patch))).status).toBe(409);
  expect(
    (await cancel(first.body.schedule.id, cancelInput({ expectedScheduleVersion: 2 }))).status,
  ).toBe(409);
  expect(await mutations()).toEqual([0, 0, 0]);
});

it.each([
  'categoryId',
  'kind',
  'createdByPersonId',
  'recurrence',
  'attempts',
  'maxAttempts',
  'expectedVersion',
])('cannot inject %s through a mutation', async (key) => {
  const first = await create();
  expect((await edit(first.body.schedule.id, updateInput({ [key]: 'unsupported' }))).status).toBe(
    400,
  );
  expect((await cancel(first.body.schedule.id, cancelInput({ [key]: 'unsupported' }))).status).toBe(
    400,
  );
  expect(await mutations()).toEqual([0, 0, 0]);
});

it.each(['role', 'DEACTIVATED', 'ENDED'] as const)(
  'rechecks current mutation and successful replay authority after %s',
  async (change) => {
    const first = await create();
    const body = updateInput();
    expect((await edit(first.body.schedule.id, body)).status).toBe(200);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: change === 'role' ? { role: 'VOLUNTEER' } : { status: change },
    });
    expect((await edit(first.body.schedule.id, body)).status).toBe(403);
    expect(
      (await cancel(first.body.schedule.id, cancelInput({ expectedScheduleVersion: 2 }))).status,
    ).toBe(403);
    expect((await list()).status).toBe(403);
  },
);

it.each(['edit', 'cancel'] as const)(
  'rolls back %s and its receipt when the atomic audit fails',
  async (operation) => {
    const first = await create();
    const before = await f.action(first.body.schedule.id);
    const failure = vi
      .spyOn(audit, 'writeAudit')
      .mockRejectedValueOnce(new Error('Injected category management audit failure'));
    try {
      expect(
        (
          await (operation === 'edit'
            ? edit(first.body.schedule.id)
            : cancel(first.body.schedule.id))
        ).status,
      ).toBe(500);
    } finally {
      failure.mockRestore();
    }
    expect(await f.action(first.body.schedule.id)).toEqual(before);
    expect(await mutations()).toEqual([0, 0, 0]);
  },
);

it('rolls back an edited action and its audit when reservation settlement fails', async () => {
  const first = await create();
  const before = await f.action(first.body.schedule.id);
  const failure = vi
    .spyOn(replay, 'settleReserved')
    .mockRejectedValueOnce(new Error('Injected reservation outcome failure'));
  try {
    expect((await edit(first.body.schedule.id)).status).toBe(500);
  } finally {
    failure.mockRestore();
  }
  expect(await f.action(first.body.schedule.id)).toEqual(before);
  expect(await mutations()).toEqual([0, 0, 0]);
});

it('allows only one optimistic concurrent edit against a reviewed action version', async () => {
  const first = await create();
  const outcomes = await Promise.all([
    edit(first.body.schedule.id),
    edit(first.body.schedule.id, updateInput({ active: true })),
  ]);
  expect(outcomes.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect((await f.action(first.body.schedule.id)).version).toBe(2);
  expect(await mutations()).toEqual([1, 0, 0]);
});
