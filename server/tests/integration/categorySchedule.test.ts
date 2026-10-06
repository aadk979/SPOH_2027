import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  CategoryActivityListResponse,
  CategoryActivityResponse,
  CategoryScheduleResponse,
  CreateCategoryScheduleRequest,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { registrationScheduledHandlers } from '../../src/modules/registration/index.js';
import { createCategorySchedule } from '../../src/modules/taxonomy/index.js';
import * as audit from '../../src/platform/audit/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
const registry = new HandlerRegistry(registrationScheduledHandlers);
let f: ScheduledLifecycleFixture;
let reviewed: { active: boolean; updatedAt: string };
const root = () => `/api/v1/events/${f.eventId}/admin/capture-categories`;
const endpoint = (categoryId = f.categoryId) => `${root()}/${categoryId}/schedules`;
const input = (patch = {}) => ({
  active: false,
  expectedActive: reviewed.active,
  expectedUpdatedAt: reviewed.updatedAt,
  reason: 'Reviewed synthetic category pause',
  runAt: lifecycleAt(60_000).toISOString(),
  idempotencyKey: randomUUID(),
  ...patch,
});
const post = (body = input(), categoryId = f.categoryId) =>
  request(app).post(endpoint(categoryId)).set('Authorization', bearer(f.creator)).send(body);
const get = (id: string) =>
  request(app).get(`${endpoint()}/${id}`).set('Authorization', bearer(f.creator));
const category = () => rawDb.captureCategory.findUniqueOrThrow({ where: { id: f.categoryId } });
const actor = () => ({
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
  clock: fixedClock(lifecycleAt(0)),
});
const effects = () =>
  Promise.all([
    rawDb.scheduledAction.count({ where: { eventId: f.eventId, type: 'taxonomy.setActive' } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'schedule.create' } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'category.setActive' } }),
  ]);
const run = async (instant = lifecycleAt(60_000)) => {
  const claims = await claimDueActions({
    types: registry.types(),
    workerId: 'category-producer-test',
    clock: fixedClock(instant),
  });
  expect(claims).toHaveLength(1);
  return runClaimedAction({ claim: claims[0]!, registry, clock: fixedClock(instant) });
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

it('returns a private current snapshot and includes inactive categories without changing booth reads', async () => {
  await rawDb.captureCategory.update({ where: { id: f.categoryId }, data: { active: false } });
  const list = await request(app).get(root()).set('Authorization', bearer(f.creator));
  expect(list.status).toBe(200);
  expect(list.headers['cache-control']).toBe('no-store');
  expect(CategoryActivityListResponse.parse(list.body).data).toEqual([
    expect.objectContaining({ id: f.categoryId, active: false }),
  ]);
  const current = await request(app)
    .get(`${root()}/${f.categoryId}`)
    .set('Authorization', bearer(f.creator));
  expect(CategoryActivityResponse.parse(current.body).data.active).toBe(false);
  const booth = await request(app)
    .get(`/api/v1/events/${f.eventId}/registrations/categories`)
    .set('Authorization', bearer(f.creator));
  expect(booth.body.data).toEqual([]);
});

it('pages all category states on immutable creation keys and refuses foreign cursors', async () => {
  await rawDb.captureCategory.createMany({
    data: ['ONE', 'TWO', 'THREE'].map((code, index) => ({
      eventId: f.eventId,
      code,
      label: code,
      active: index % 2 === 0,
      sortOrder: index,
      createdAt: lifecycleAt(index),
    })),
  });
  const headers = { Authorization: bearer(f.creator) };
  const first = CategoryActivityListResponse.parse(
    (await request(app).get(`${root()}?limit=2`).set(headers)).body,
  );
  expect(first.data).toHaveLength(2);
  expect(first.meta.nextCursor).toBeTruthy();
  const next = CategoryActivityListResponse.parse(
    (await request(app).get(`${root()}?limit=2&cursor=${first.meta.nextCursor}`).set(headers)).body,
  );
  expect(next.data).toHaveLength(2);
  expect(new Set([...first.data, ...next.data].map(({ id }) => id)).size).toBe(4);
  expect(next.meta.nextCursor).toBeNull();
  const foreign = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId: (await testEvent()).eventId },
  });
  expect((await request(app).get(`${root()}?cursor=${foreign.id}`).set(headers)).status).toBe(404);
});

it('creates one audited future action with the strict existing worker payload and identifier-only receipt', async () => {
  const before = await category();
  const body = input({ reason: '  Reviewed synthetic category pause  ' });
  const response = await post(body);
  expect(response.status).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  const parsed = CategoryScheduleResponse.parse(response.body);
  expect(parsed.schedule).toMatchObject({
    categoryId: f.categoryId,
    active: false,
    expectedActive: true,
    status: 'PENDING',
    version: 1,
    recurring: false,
    createdByYou: true,
  });
  expect(parsed.current.data.active).toBe(true);
  expect(await category()).toEqual(before);
  const row = await f.action(parsed.schedule.id);
  expect(row.payload).toEqual({ kind: 'category', id: f.categoryId, active: false });
  registrationScheduledHandlers[0]!.validatePayload(row.payload);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
      .responseBody,
  ).toEqual({ scheduledActionId: row.id, categoryId: f.categoryId });
  const creation = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId: f.eventId, action: 'schedule.create' },
  });
  expect(creation).toMatchObject({
    source: 'USER',
    actorId: f.creator.id,
    membershipId: f.membershipId,
    entityId: row.id,
    after: {
      version: 1,
      intent: { categoryId: f.categoryId, reason: 'Reviewed synthetic category pause' },
    },
  });
  expect(await effects()).toEqual([1, 1, 0]);
});

it('applies the public producer only at its due boundary and replays fresh completed state', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(201);
  expect(
    await claimDueActions({
      types: registry.types(),
      workerId: 'early-category',
      clock: fixedClock(lifecycleAt(59_999)),
    }),
  ).toEqual([]);
  expect((await category()).active).toBe(true);
  expect(await run()).toBe('SUCCEEDED');
  expect(await category()).toMatchObject({ active: false, updatedAt: lifecycleAt(60_000) });
  const replay = await post(body);
  expect(replay.status).toBe(201);
  expect(replay.body.schedule).toMatchObject({
    id: first.body.schedule.id,
    status: 'SUCCEEDED',
    version: 3,
    attempts: 1,
  });
  expect(replay.body.current.data.active).toBe(false);
  expect(
    await claimDueActions({
      types: registry.types(),
      workerId: 'late-category',
      clock: fixedClock(lifecycleAt(120_000)),
    }),
  ).toEqual([]);
  expect(await effects()).toEqual([1, 1, 1]);
});

it('also executes through the actual API worker composition', async () => {
  const first = await post(input());
  expect(first.status).toBe(201);
  const worker = await startScheduledJobs(fixedClock(lifecycleAt(60_000)));
  try {
    await expect
      .poll(async () => (await f.action(first.body.schedule.id)).status)
      .toBe('SUCCEEDED');
    expect((await category()).active).toBe(false);
  } finally {
    await worker.stop();
  }
});

it('retains absolute execution if category state or its timestamp changes after submission', async () => {
  const first = await post(input());
  expect(first.status).toBe(201);
  await rawDb.captureCategory.update({
    where: { id: f.categoryId },
    data: { active: false, updatedAt: lifecycleAt(10_000) },
  });
  await rawDb.captureCategory.update({
    where: { id: f.categoryId },
    data: { active: true, updatedAt: lifecycleAt(20_000) },
  });
  expect(await run()).toBe('SUCCEEDED');
  expect((await category()).active).toBe(false);
});

it('records only an outcome for an absolute no-op and preserves category identity/metadata/history', async () => {
  const before = await category();
  const first = await post(input({ active: true }));
  expect(first.status).toBe(201);
  expect(await run()).toBe('SUCCEEDED');
  expect(await category()).toEqual(before);
  expect((await f.receipts(first.body.schedule.id)).map(({ action }) => action)).toEqual([
    'schedule.execute',
  ]);
  expect(await effects()).toEqual([1, 1, 0]);
});

it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED'] as const)(
  'can submit the supported category action in %s',
  async (status) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    expect((await post()).status).toBe(201);
  },
);

it.each([
  { expectedActive: false },
  { expectedUpdatedAt: lifecycleAt(-1).toISOString() },
  { runAt: lifecycleAt(0).toISOString() },
])('refuses a stale snapshot or nonfuture submission %j', async (patch) => {
  expect((await post(input(patch))).status).toBe(409);
  expect(await effects()).toEqual([0, 0, 0]);
});

it.each([
  { kind: 'station' },
  { type: 'event.transition' },
  { categoryId: 'foreign' },
  { eventId: 'foreign' },
  { recurrence: 5 },
  { attempts: 0 },
  { expectedCategoryVersion: 1 },
  { reason: '  ' },
  { expectedActive: 'true' },
  { expectedUpdatedAt: undefined },
])('rejects unsupported client fields or invalid review %j before reserving', async (patch) => {
  expect((await post(input(patch))).status).toBe(400);
  expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(0);
  expect(await effects()).toEqual([0, 0, 0]);
});

it('canonicalises equivalent offset/reason replays and binds category and complete original intent', async () => {
  const body = input();
  const first = await post(body);
  const equivalent = { ...body, runAt: '2027-01-07T11:31:00+08:00', reason: `  ${body.reason}  ` };
  expect((await post(equivalent)).status).toBe(201);
  for (const patch of [
    { active: true },
    { expectedActive: false },
    { expectedUpdatedAt: new Date(Date.parse(body.expectedUpdatedAt) + 1).toISOString() },
    { reason: 'Another review' },
    { runAt: lifecycleAt(120_000).toISOString() },
  ]) {
    const replay = await post({ ...body, ...patch });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  }
  const other = await rawDb.captureCategory.create({
    data: { eventId: f.eventId, code: 'OTHER', label: 'Other' },
  });
  expect((await post(body, other.id)).status).toBe(409);
  expect((await get(first.body.schedule.id)).status).toBe(200);
  expect(await effects()).toEqual([1, 1, 0]);
});

it('rejects unknown/foreign category and action paths and private anonymous access', async () => {
  const foreign = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId: (await testEvent()).eventId },
  });
  for (const categoryId of ['missing-category', foreign.id]) {
    expect((await post(input(), categoryId)).status).toBe(404);
    expect(
      (await request(app).get(`${root()}/${categoryId}`).set('Authorization', bearer(f.creator)))
        .status,
    ).toBe(404);
  }
  expect((await get('missing-action')).status).toBe(404);
  for (const result of [
    await request(app).get(root()),
    await request(app).post(endpoint()).send(input()),
    await request(app).get(`${endpoint()}/missing`),
  ]) {
    expect(result.status).toBe(401);
    expect(result.headers['cache-control']).toBe('no-store');
  }
});

it.each(['role', 'DEACTIVATED', 'ENDED'] as const)(
  'refuses cached current authority after %s for read/create/replay',
  async (change) => {
    const body = input();
    const first = await post(body);
    expect(first.status).toBe(201);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: change === 'role' ? { role: 'VOLUNTEER' } : { status: change },
    });
    expect((await post()).status).toBe(403);
    expect((await post(body)).status).toBe(403);
    expect((await get(first.body.schedule.id)).status).toBe(403);
    expect((await request(app).get(root()).set('Authorization', bearer(f.creator))).status).toBe(
      403,
    );
  },
);

it('keeps archive reads/replays available while refusing new effects', async () => {
  const body = input();
  const first = await post(body);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  expect((await post()).status).toBe(409);
  expect((await post(body)).status).toBe(201);
  expect((await get(first.body.schedule.id)).body.current.eventStatus).toBe('ARCHIVED');
  expect(await run()).toBe('FAILED');
  expect((await category()).active).toBe(true);
});

it('rolls back action/audit/receipt on audit failure and permits a genuine identical retry', async () => {
  const body = input();
  const failure = vi
    .spyOn(audit, 'writeAudit')
    .mockRejectedValueOnce(new Error('Injected category schedule audit failure'));
  try {
    expect((await post(body)).status).toBe(500);
  } finally {
    failure.mockRestore();
  }
  expect(await effects()).toEqual([0, 0, 0]);
  await expect.poll(() => rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(0);
  expect((await post(body)).status).toBe(201);
});

it('requires verified user attribution instead of a system or mismatched actor audit', async () => {
  for (const patch of [
    { actorId: null },
    { eventId: null },
    { membershipId: null },
    { actorSub: null },
    { source: 'SCHEDULE' as const },
    { scheduledActionId: 'foreign-action' },
  ]) {
    const body = CreateCategoryScheduleRequest.parse(input());
    await reserve(body.idempotencyKey, {
      endpoint: 'taxonomy.category.schedule',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    });
    const context = actor();
    await expect(
      createCategorySchedule(
        { categoryId: f.categoryId, request: body },
        { ...context, audit: { ...context.audit, ...patch } },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(await effects()).toEqual([0, 0, 0]);
});

it('another legitimate current manager can read without receiving creator identity or reusing its receipt', async () => {
  const body = input();
  const first = await post(body);
  const other = await createVolunteer({
    email: 'other-category-manager@test.example',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'ADMIN' },
  });
  const result = await request(app)
    .get(`${endpoint()}/${first.body.schedule.id}`)
    .set('Authorization', bearer(other));
  expect(result.status).toBe(200);
  expect(result.body.schedule.createdByYou).toBe(false);
  for (const privateValue of [
    f.creator.id,
    f.creator.sub,
    f.membershipId,
    'payload',
    'lockedBy',
    'dedupeKey',
  ])
    expect(JSON.stringify(result.body)).not.toContain(privateValue);
  expect(
    (await request(app).post(endpoint()).set('Authorization', bearer(other)).send(body)).status,
  ).toBe(409);
});
