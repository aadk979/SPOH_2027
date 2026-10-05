import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureScheduleListQuery,
  CaptureScheduleListResponse,
  CaptureScheduleResponse,
  CancelCaptureScheduleRequest,
  UpdateCaptureScheduleRequest,
  type CommitteeRole,
} from '@spoh/shared';
import * as audit from '../../src/platform/audit/index.js';
import { settingsScheduledHandlers } from '../../src/modules/settings/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { updateCaptureSchedule } from '../../src/modules/settings/application/updateCaptureSchedule.js';
import { cancelCaptureSchedule } from '../../src/modules/settings/application/cancelCaptureSchedule.js';
import { listCaptureSchedules } from '../../src/modules/settings/application/listCaptureSchedules.js';
import { readCaptureScheduleMutation } from '../../src/modules/settings/application/readCaptureScheduleMutation.js';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, createStation, testEvent } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
const { reserve } = idempotency;
let f: ScheduledLifecycleFixture;
const member = async (email: string, role: CommitteeRole = 'ADMIN') => {
  const person = await createVolunteer({ email, role });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role, status: 'ACTIVE' },
  });
  return person;
};
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
});
const waitForLock = async (table: string, mode: string) => {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%FROM "${table}"%FOR ${mode}%`}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
};
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue/schedules`;
const updateInput = (patch = {}) => ({
  expectedScheduleVersion: 1,
  expectedVersion: 0,
  value: false,
  runAt: lifecycleAt(120_000).toISOString(),
  reason: 'Reviewed synthetic edit',
  idempotencyKey: randomUUID(),
  ...patch,
});
const cancelInput = (patch = {}) => ({
  expectedScheduleVersion: 1,
  reason: 'Reviewed synthetic cancellation',
  idempotencyKey: randomUUID(),
  ...patch,
});
const edit = (id: string, body: object = updateInput()) =>
  request(app).patch(`${endpoint()}/${id}`).set('Authorization', bearer(f.creator)).send(body);
const cancel = (id: string, body: object = cancelInput()) =>
  request(app)
    .post(`${endpoint()}/${id}/cancel`)
    .set('Authorization', bearer(f.creator))
    .send(body);
const list = (query = {}) =>
  request(app).get(endpoint()).query(query).set('Authorization', bearer(f.creator));
const effects = async () =>
  Promise.all([
    rawDb.setting.count({ where: { eventId: f.eventId } }),
    rawDb.settingChange.count({ where: { eventId: f.eventId } }),
    rawDb.auditLog.count({
      where: { eventId: f.eventId, action: { in: ['schedule.update', 'schedule.cancel'] } },
    }),
  ]);
const create = (patch = {}) =>
  request(app)
    .post(endpoint())
    .set('Authorization', bearer(f.creator))
    .send({
      target: { scope: 'event' },
      key: 'capture.open',
      value: false,
      expectedVersion: 0,
      runAt: lifecycleAt(60_000).toISOString(),
      reason: 'Reviewed synthetic schedule',
      idempotencyKey: randomUUID(),
      ...patch,
    });
beforeEach(async () => {
  vi.setSystemTime(lifecycleAt(0));
  await resetDatabase();
  f = await scheduledLifecycleFixture();
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
afterEach(() => vi.restoreAllMocks());
it('cancellation replay remains an authorised read after archive and binds its reviewed version', async () => {
  const first = await create();
  const body = cancelInput();
  expect((await cancel(first.body.schedule.id, body)).status).toBe(200);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  const replay = await cancel(first.body.schedule.id, body);
  expect(replay.status).toBe(200);
  expect(replay.body.current.eventStatus).toBe('ARCHIVED');
  expect(
    (await cancel(first.body.schedule.id, { ...body, expectedScheduleVersion: 2 })).status,
  ).toBe(409);
  expect(
    (await cancel(first.body.schedule.id, cancelInput({ expectedScheduleVersion: 2 }))).status,
  ).toBe(409);
  expect((await list()).body.data[0].status).toBe('CANCELLED');
  expect(await effects()).toEqual([0, 0, 1]);
});
it('list metadata bounds raw errors and omits private actor/lease/payload fields', async () => {
  const first = await create();
  await rawDb.scheduledAction.update({
    where: { id: first.body.schedule.id },
    data: { status: 'FAILED', completedAt: lifecycleAt(0), lastError: 'private-worker-marker' },
  });
  const response = await list();
  const parsed = CaptureScheduleListResponse.parse(response.body);
  expect(parsed.data[0]?.lastError).toBe('EXECUTION_FAILED');
  const encoded = JSON.stringify(response.body);
  for (const privateValue of [
    'private-worker-marker',
    f.creator.id,
    f.creator.sub,
    'lockedBy',
    'lockedUntil',
    'payload',
    'createdByPersonId',
  ])
    expect(encoded).not.toContain(privateValue);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
      .lastError,
  ).toBe('private-worker-marker');
});
it('current permission loss blocks a successful replay and list despite the prior token/cache', async () => {
  const first = await create();
  const body = updateInput();
  expect((await edit(first.body.schedule.id, body)).status).toBe(200);
  await rawDb.eventMembership.update({
    where: { id: f.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  expect((await edit(first.body.schedule.id, body)).status).toBe(403);
  expect((await list()).status).toBe(403);
  expect(await effects()).toEqual([0, 0, 1]);
});
it('strict cancellation and mutation query boundaries refuse unreviewed controls', async () => {
  const first = await create();
  for (const patch of [
    { value: true },
    { target: { scope: 'event' } },
    { expectedScheduleVersion: 0 },
    { reason: 'x' },
    { eventId: 'foreign' },
  ])
    expect((await cancel(first.body.schedule.id, cancelInput(patch))).status).toBe(400);
  expect(
    (
      await request(app)
        .patch(`${endpoint()}/${first.body.schedule.id}?eventId=foreign`)
        .set('Authorization', bearer(f.creator))
        .send(updateInput())
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post(`${endpoint()}/${first.body.schedule.id}/cancel?eventId=foreign`)
        .set('Authorization', bearer(f.creator))
        .send(cancelInput())
    ).status,
  ).toBe(400);
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each(['edit', 'cancel'] as const)(
  'rolls back %s and audit if the atomic receipt fails',
  async (kind) => {
    const first = await create();
    vi.spyOn(idempotency, 'settleReserved').mockRejectedValueOnce(
      new Error('Synthetic receipt failure'),
    );
    const response = await (kind === 'edit'
      ? edit(first.body.schedule.id)
      : cancel(first.body.schedule.id));
    expect(response.status).toBe(500);
    expect(await effects()).toEqual([0, 0, 0]);
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
        .version,
    ).toBe(1);
    expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(1);
  },
);
it('concurrent same-UUID edits eventually replay one audit and one version increment', async () => {
  const first = await create();
  const body = updateInput();
  const responses = await Promise.all([
    edit(first.body.schedule.id, body),
    edit(first.body.schedule.id, body),
  ]);
  expect(responses.some((response) => response.status === 200)).toBe(true);
  expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
  expect((await edit(first.body.schedule.id, body)).status).toBe(200);
  expect(await effects()).toEqual([0, 0, 1]);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
      .version,
  ).toBe(2);
  expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(2);
});
it('an editor holding the action prevents a real due claim until its future definition commits', async () => {
  const first = await create();
  const body = UpdateCaptureScheduleRequest.parse(updateInput());
  await reserve(body.idempotencyKey, {
    endpoint: 'setting.capture.schedule.update',
    actorSub: f.creator.sub,
    eventId: f.eventId,
  });
  let pending: ReturnType<typeof updateCaptureSchedule> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${body.idempotencyKey} FOR UPDATE`;
    pending = updateCaptureSchedule({ id: first.body.schedule.id, request: body }, actor());
    void pending.catch(() => undefined);
    await waitForLock('IdempotencyRecord', 'UPDATE');
    expect(
      await claimDueActions({
        types: ['setting.apply'],
        workerId: 'losing-claim',
        clock: fixedClock(lifecycleAt(60_000)),
      }),
    ).toEqual([]);
  });
  await expect(pending).resolves.toMatchObject({
    schedule: { status: 'PENDING', version: 2, runAt: body.runAt },
  });
  expect(
    await claimDueActions({
      types: ['setting.apply'],
      workerId: 'old-time',
      clock: fixedClock(lifecycleAt(60_000)),
    }),
  ).toEqual([]);
  const claims = await claimDueActions({
    types: ['setting.apply'],
    workerId: 'new-time',
    clock: fixedClock(lifecycleAt(120_000)),
  });
  expect(claims).toHaveLength(1);
  expect(await effects()).toEqual([0, 0, 1]);
});
it('lists supported capture schedules for the exact event target', async () => {
  const first = await create();
  expect(first.status).toBe(201);
  const list = await request(app).get(endpoint()).set('Authorization', bearer(f.creator));
  expect(list.status).toBe(200);
  expect(list.headers['cache-control']).toBe('no-store');
  expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([first.body.schedule.id]);
});
it('edits fixed intent atomically and executes only the new reviewed time through the real worker', async () => {
  const first = await create({ value: true });
  expect(first.status).toBe(201);
  const body = updateInput();
  const changed = await edit(first.body.schedule.id, body);
  expect(changed.status).toBe(200);
  expect(changed.headers['cache-control']).toBe('no-store');
  expect(CaptureScheduleResponse.parse(changed.body).schedule).toMatchObject({
    version: 2,
    value: false,
    target: { scope: 'event' },
    runAt: body.runAt,
    scheduledFor: body.runAt,
    createdByYou: true,
    status: 'PENDING',
  });
  expect(await effects()).toEqual([0, 0, 1]);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
      .responseBody,
  ).toEqual({ scheduledActionId: first.body.schedule.id, mutationVersion: 2 });
  const registry = new HandlerRegistry(settingsScheduledHandlers);
  const claims = (offset: number) =>
    claimDueActions({
      types: registry.types(),
      workerId: 'capture-management',
      clock: fixedClock(lifecycleAt(offset)),
    });
  expect(await claims(60_000)).toEqual([]);
  const due = await claims(120_000);
  expect(due).toHaveLength(1);
  expect(
    await runClaimedAction({ claim: due[0]!, registry, clock: fixedClock(lifecycleAt(120_000)) }),
  ).toBe('SUCCEEDED');
  const retry = await edit(first.body.schedule.id, body);
  expect(retry.status).toBe(200);
  expect(retry.body.schedule.status).toBe('SUCCEEDED');
  expect(
    retry.body.current.data.find((row: { key: string }) => row.key === 'capture.open').value,
  ).toBe(false);
  expect(await effects()).toEqual([1, 1, 1]);
  expect(
    (await rawDb.settingChange.findFirstOrThrow({ where: { eventId: f.eventId } })).actorPersonId,
  ).toBe(f.creator.id);
});
it('cancels pending work once without setting effects or a worker claim', async () => {
  const first = await create();
  const body = cancelInput();
  const stopped = await cancel(first.body.schedule.id, body);
  expect(stopped.status).toBe(200);
  expect(stopped.body.schedule).toMatchObject({ status: 'CANCELLED', version: 2, attempts: 0 });
  expect(stopped.body.schedule.completedAt).toBe(lifecycleAt(0).toISOString());
  expect((await cancel(first.body.schedule.id, body)).status).toBe(200);
  expect(await effects()).toEqual([0, 0, 1]);
  expect(
    await claimDueActions({
      types: ['setting.apply'],
      workerId: 'after-cancel',
      clock: fixedClock(lifecycleAt(120_000)),
    }),
  ).toEqual([]);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
      .responseBody,
  ).toEqual({ scheduledActionId: first.body.schedule.id, mutationVersion: 2 });
});
it('old edit replay uses immutable intent and fresh values after later edits, cancellation and archive', async () => {
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
          value: true,
          runAt: lifecycleAt(180_000).toISOString(),
        }),
      )
    ).status,
  ).toBe(200);
  const later = await edit(id, body);
  expect(later.status).toBe(200);
  expect(later.body.schedule).toMatchObject({ version: 3, value: true });
  expect((await cancel(id, cancelInput({ expectedScheduleVersion: 3 }))).status).toBe(200);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'capture.open',
      value: false,
      version: 8,
    },
  });
  const replay = await edit(id, body);
  expect(replay.status).toBe(200);
  expect(replay.body.schedule).toMatchObject({ version: 4, status: 'CANCELLED' });
  expect(replay.body.current.eventStatus).toBe('ARCHIVED');
  expect(
    replay.body.current.data.find((row: { key: string }) => row.key === 'capture.open'),
  ).toMatchObject({ value: false, storedVersion: 8 });
  expect((await edit(id, updateInput({ expectedScheduleVersion: 4 }))).status).toBe(409);
  expect(await effects()).toEqual([1, 0, 3]);
});
it.each([
  { value: true },
  { expectedVersion: 1 },
  { expectedScheduleVersion: 2 },
  { reason: 'Altered review' },
  { runAt: lifecycleAt(180_000).toISOString() },
])('refuses altered successful edit intent %j', async (patch) => {
  const first = await create();
  const body = updateInput();
  expect((await edit(first.body.schedule.id, body)).status).toBe(200);
  const replay = await edit(first.body.schedule.id, { ...body, ...patch });
  expect(replay.status).toBe(409);
  expect(replay.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  expect(await effects()).toEqual([0, 0, 1]);
});
it('binds cancellation intent and route id, and rejects receipt reuse across actors and operations', async () => {
  const first = await create();
  const second = await create();
  const body = cancelInput();
  expect((await cancel(first.body.schedule.id, body)).status).toBe(200);
  expect(
    (await cancel(first.body.schedule.id, { ...body, reason: 'Altered cancellation' })).status,
  ).toBe(409);
  expect((await cancel(second.body.schedule.id, body)).status).toBe(409);
  expect(
    (await edit(first.body.schedule.id, updateInput({ idempotencyKey: body.idempotencyKey })))
      .status,
  ).toBe(409);
  const other = await member('other-capture-manager@test.example');
  expect(
    (
      await request(app)
        .post(`${endpoint()}/${first.body.schedule.id}/cancel`)
        .set('Authorization', bearer(other))
        .send(body)
    ).status,
  ).toBe(409);
  expect(await effects()).toEqual([0, 0, 1]);
});
it('another current manager can read and cancel, but cannot rewrite the creator intent', async () => {
  const first = await create();
  const other = await member('other-capture-manager@test.example');
  const view = await request(app).get(endpoint()).set('Authorization', bearer(other));
  expect(view.status).toBe(200);
  expect(view.body.data[0].createdByYou).toBe(false);
  expect(
    (
      await request(app)
        .patch(`${endpoint()}/${first.body.schedule.id}`)
        .set('Authorization', bearer(other))
        .send(updateInput())
    ).status,
  ).toBe(404);
  const stop = await request(app)
    .post(`${endpoint()}/${first.body.schedule.id}/cancel`)
    .set('Authorization', bearer(other))
    .send(cancelInput());
  expect(stop.status).toBe(200);
  expect(await effects()).toEqual([0, 0, 1]);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
      .createdByPersonId,
  ).toBe(f.creator.id);
  expect(
    (
      await rawDb.auditLog.findFirstOrThrow({
        where: { eventId: f.eventId, action: 'schedule.cancel' },
      })
    ).actorId,
  ).toBe(other.id);
});
it.each(['RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
  'never edits or cancels %s work',
  async (status) => {
    const first = await create();
    await rawDb.scheduledAction.update({
      where: { id: first.body.schedule.id },
      data: {
        status,
        ...(status === 'RUNNING'
          ? { lockedBy: 'owned-worker', lockedUntil: lifecycleAt(300_000) }
          : { completedAt: lifecycleAt(0) }),
      },
    });
    expect((await edit(first.body.schedule.id)).status).toBe(409);
    expect((await cancel(first.body.schedule.id)).status).toBe(409);
    expect(await effects()).toEqual([0, 0, 0]);
  },
);
it('refuses stale schedule/current setting versions and due edits without effects', async () => {
  const first = await create();
  const id = first.body.schedule.id;
  expect((await edit(id, updateInput({ expectedScheduleVersion: 2 }))).status).toBe(409);
  expect((await cancel(id, cancelInput({ expectedScheduleVersion: 2 }))).status).toBe(409);
  expect((await edit(id, updateInput({ expectedVersion: 1 }))).body.error.code).toBe(
    'SETTING_VERSION_CONFLICT',
  );
  expect((await edit(id, updateInput({ runAt: lifecycleAt(0).toISOString() }))).status).toBe(409);
  expect(await effects()).toEqual([0, 0, 0]);
});
it('reviews station stored version zero even when the event parent version is seven', async () => {
  const first = await create({ target: { scope: 'station', stationId: f.stationId } });
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'capture.open',
      value: true,
      version: 7,
    },
  });
  expect((await edit(first.body.schedule.id, updateInput({ expectedVersion: 7 }))).status).toBe(
    409,
  );
  const changed = await edit(first.body.schedule.id);
  expect(changed.status).toBe(200);
  expect(changed.body.schedule.expectedVersion).toBe(0);
  expect(changed.body.schedule.target.stationId).toBe(f.stationId);
  expect(await effects()).toEqual([1, 0, 1]);
});
it.each([
  { target: { scope: 'event' } },
  { key: 'product.visitorDataMode' },
  { createdByPersonId: 'foreign' },
  { recurrence: 60 },
  { expectedScheduleVersion: 0 },
  { reason: 'x' },
  { value: 'false' },
])('refuses strict edit boundary fields %j', async (patch) => {
  const first = await create();
  const changed = await edit(first.body.schedule.id, updateInput(patch));
  expect(changed.status).toBe(400);
  expect(changed.headers['cache-control']).toBe('no-store');
  expect(await effects()).toEqual([0, 0, 0]);
});
it('refuses anonymous and non-manager list/edit/cancel with private errors', async () => {
  const first = await create();
  const person = await member('capture-reader@test.example', 'VOLUNTEER');
  for (const token of [null, bearer(person)]) {
    const calls = [
      request(app).get(endpoint()),
      request(app).patch(`${endpoint()}/${first.body.schedule.id}`).send(updateInput()),
      request(app).post(`${endpoint()}/${first.body.schedule.id}/cancel`).send(cancelInput()),
    ];
    for (const call of calls) {
      if (token) call.set('Authorization', token);
      const response = await call;
      expect(response.status).toBe(token ? 403 : 401);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  }
  expect(await effects()).toEqual([0, 0, 0]);
});
it('lists exact targets and preserves keyset progress after the cursor changes status', async () => {
  const created = [await create(), await create(), await create()];
  const station = await create({ target: { scope: 'station', stationId: f.stationId } });
  const ids = created
    .map((item) => item.body.schedule.id)
    .sort()
    .reverse();
  const page1 = CaptureScheduleListResponse.parse(
    (await list({ status: 'PENDING', limit: 1 })).body,
  );
  expect(page1.data.map(({ id }) => id)).toEqual(ids.slice(0, 1));
  expect((await cancel(ids[0]!)).status).toBe(200);
  const page2 = CaptureScheduleListResponse.parse(
    (await list({ status: 'PENDING', limit: 2, cursor: page1.meta.nextCursor })).body,
  );
  expect(page2.data.map(({ id }) => id)).toEqual(ids.slice(1));
  expect(page2.meta.nextCursor).toBe(null);
  const owned = CaptureScheduleListResponse.parse(
    (await list({ scope: 'station', stationId: f.stationId })).body,
  );
  expect(owned.data.map(({ id }) => id)).toEqual([station.body.schedule.id]);
  expect((await list({ cursor: station.body.schedule.id })).status).toBe(404);
});
it('isolates foreign targets/cursors/action ids and rejects forged list filters', async () => {
  const first = await create();
  const foreignStation = await createStation({ code: 'FOREIGN-CAPTURE' });
  expect((await list({ scope: 'station', stationId: foreignStation.id })).status).toBe(404);
  const other = await testEvent();
  const foreign = await rawDb.scheduledAction.create({
    data: {
      eventId: other.eventId,
      type: 'setting.apply',
      runAt: lifecycleAt(60_000),
      payload: {},
      createdByPersonId: f.creator.id,
    },
  });
  expect((await list({ cursor: foreign.id })).status).toBe(404);
  expect((await edit(foreign.id)).status).toBe(404);
  expect((await cancel(foreign.id)).status).toBe(404);
  for (const query of [
    { scope: 'platform' },
    { scope: 'station' },
    { key: 'product.visitorDataMode' },
    { eventId: other.eventId },
  ])
    expect((await list(query)).status).toBe(400);
  expect((await list()).body.data[0].id).toBe(first.body.schedule.id);
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each(['payload', 'audit', 'creator', 'recurrence', 'dedupe'] as const)(
  'omits unsupported %s storage without modifying it',
  async (kind) => {
    const first = await create();
    const id = first.body.schedule.id;
    if (kind === 'audit')
      await rawDb.auditLog.deleteMany({ where: { eventId: f.eventId, action: 'schedule.create' } });
    else
      await rawDb.scheduledAction.update({
        where: { id },
        data:
          kind === 'payload'
            ? {
                payload: {
                  scope: 'event',
                  scopeId: f.eventId,
                  key: 'capture.open',
                  value: false,
                  expectedVersion: 0,
                  reason: 'Private malformed marker',
                  extra: 'private-storage-marker',
                },
              }
            : kind === 'creator'
              ? { createdByPersonId: null }
              : kind === 'recurrence'
                ? { recurrence: 60 }
                : { dedupeKey: 'private-dedupe' },
      });
    const original = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
    expect((await list()).body.data).toEqual([]);
    expect((await edit(id)).status).toBe(404);
    expect((await cancel(id)).status).toBe(404);
    expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id } })).toEqual(original);
    expect(await effects()).toEqual([0, 0, 0]);
  },
);
it('raw malformed page rows still yield a progressing owned cursor', async () => {
  const created = [await create(), await create()];
  const ids = created
    .map((item) => item.body.schedule.id)
    .sort()
    .reverse();
  await rawDb.scheduledAction.update({
    where: { id: ids[0]! },
    data: {
      payload: {
        scope: 'event',
        scopeId: f.eventId,
        key: 'capture.open',
        value: false,
        expectedVersion: 0,
        reason: 'Malformed stored row',
        extra: 'private-marker',
      },
    },
  });
  const first = CaptureScheduleListResponse.parse((await list({ limit: 1 })).body);
  expect(first.data).toEqual([]);
  expect(first.meta.nextCursor).toBe(ids[0]);
  const second = CaptureScheduleListResponse.parse(
    (await list({ limit: 1, cursor: first.meta.nextCursor })).body,
  );
  expect(second.data.map(({ id }) => id)).toEqual(ids.slice(1));
  expect(second.meta.nextCursor).toBe(null);
});
it.each(['edit', 'cancel'] as const)(
  'rolls back %s and its receipt when atomic audit fails',
  async (kind) => {
    const first = await create();
    vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit failure'));
    const changed = await (kind === 'edit'
      ? edit(first.body.schedule.id)
      : cancel(first.body.schedule.id));
    expect(changed.status).toBe(500);
    expect(
      await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }),
    ).toMatchObject({ status: 'PENDING', version: 1 });
    expect(await effects()).toEqual([0, 0, 0]);
    expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(1);
  },
);
it('concurrent edits and cancellation commit at most one reviewed pending transition', async () => {
  const first = await create();
  const outcomes = await Promise.all([
    edit(first.body.schedule.id),
    cancel(first.body.schedule.id),
  ]);
  expect(outcomes.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await effects()).toEqual([0, 0, 1]);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
      .version,
  ).toBe(2);
});
it.each(['archive', 'authority', 'station', 'setting', 'clock'] as const)(
  'rechecks %s after its edit Event lock wait',
  async (condition) => {
    const first = await create(
      condition === 'station' ? { target: { scope: 'station', stationId: f.stationId } } : {},
    );
    const body = UpdateCaptureScheduleRequest.parse(updateInput());
    await reserve(body.idempotencyKey, {
      endpoint: 'setting.capture.schedule.update',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    });
    let now = lifecycleAt(0);
    let pending: ReturnType<typeof updateCaptureSchedule> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = updateCaptureSchedule(
        { id: first.body.schedule.id, request: body },
        { ...actor(), clock: { now: () => now } },
      );
      void pending.catch(() => undefined);
      await waitForLock('Event', 'UPDATE');
      if (condition === 'archive')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
      else if (condition === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else if (condition === 'station') await tx.station.delete({ where: { id: f.stationId } });
      else if (condition === 'setting')
        await tx.setting.create({
          data: {
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key: 'capture.open',
            value: true,
            version: 9,
          },
        });
      else now = lifecycleAt(120_000);
    });
    await expect(pending).rejects.toMatchObject({
      statusCode: condition === 'authority' ? 403 : condition === 'station' ? 404 : 409,
    });
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
        .version,
    ).toBe(1);
    expect((await effects()).slice(1)).toEqual([0, 0]);
  },
);
it.each(['edit', 'cancel', 'list', 'replay'] as const)(
  'rechecks deactivation after its %s exact-member wait',
  async (kind) => {
    const first = await create();
    const body = UpdateCaptureScheduleRequest.parse(updateInput());
    if (kind === 'replay') expect((await edit(first.body.schedule.id, body)).status).toBe(200);
    else if (kind !== 'list')
      await reserve(body.idempotencyKey, {
        endpoint:
          kind === 'edit' ? 'setting.capture.schedule.update' : 'setting.capture.schedule.cancel',
        actorSub: f.creator.sub,
        eventId: f.eventId,
      });
    let pending: Promise<unknown> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      pending =
        kind === 'edit'
          ? updateCaptureSchedule({ id: first.body.schedule.id, request: body }, actor())
          : kind === 'cancel'
            ? cancelCaptureSchedule(
                {
                  id: first.body.schedule.id,
                  request: CancelCaptureScheduleRequest.parse(
                    cancelInput({ idempotencyKey: body.idempotencyKey }),
                  ),
                },
                actor(),
              )
            : kind === 'list'
              ? listCaptureSchedules(CaptureScheduleListQuery.parse({}), actor())
              : readCaptureScheduleMutation(
                  {
                    id: first.body.schedule.id,
                    mutationVersion: 2,
                    action: 'schedule.update',
                    request: body,
                  },
                  actor(),
                );
      void pending.catch(() => undefined);
      await waitForLock('EventMembership', 'SHARE');
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 403 });
    expect((await effects()).slice(0, 2)).toEqual([0, 0]);
  },
);
it('refuses an owned station deleted while its edit waits for the station lock', async () => {
  const first = await create({ target: { scope: 'station', stationId: f.stationId } });
  const body = UpdateCaptureScheduleRequest.parse(updateInput());
  await reserve(body.idempotencyKey, {
    endpoint: 'setting.capture.schedule.update',
    actorSub: f.creator.sub,
    eventId: f.eventId,
  });
  let pending: ReturnType<typeof updateCaptureSchedule> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Station" WHERE id = ${f.stationId} FOR UPDATE`;
    pending = updateCaptureSchedule({ id: first.body.schedule.id, request: body }, actor());
    void pending.catch(() => undefined);
    await waitForLock('Station', 'SHARE');
    await tx.station.delete({ where: { id: f.stationId } });
  });
  await expect(pending).rejects.toMatchObject({ statusCode: 404 });
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each(['version', 'running', 'clock'] as const)(
  'rechecks %s after its action lock wait',
  async (condition) => {
    const first = await create();
    const body = UpdateCaptureScheduleRequest.parse(updateInput());
    await reserve(body.idempotencyKey, {
      endpoint: 'setting.capture.schedule.update',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    });
    let now = lifecycleAt(0);
    let pending: ReturnType<typeof updateCaptureSchedule> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${first.body.schedule.id} FOR UPDATE`;
      pending = updateCaptureSchedule(
        { id: first.body.schedule.id, request: body },
        { ...actor(), clock: { now: () => now } },
      );
      void pending.catch(() => undefined);
      await waitForLock('ScheduledAction', 'UPDATE');
      if (condition === 'version')
        await tx.scheduledAction.update({
          where: { id: first.body.schedule.id },
          data: { version: 2 },
        });
      else if (condition === 'running')
        await tx.scheduledAction.update({
          where: { id: first.body.schedule.id },
          data: { status: 'RUNNING', lockedBy: 'other-worker', lockedUntil: lifecycleAt(300_000) },
        });
      else now = lifecycleAt(120_000);
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    expect(await effects()).toEqual([0, 0, 0]);
  },
);
it('refuses a newly due edit after its reservation lock wait', async () => {
  const first = await create();
  const body = UpdateCaptureScheduleRequest.parse(updateInput());
  await reserve(body.idempotencyKey, {
    endpoint: 'setting.capture.schedule.update',
    actorSub: f.creator.sub,
    eventId: f.eventId,
  });
  let now = lifecycleAt(0);
  let pending: ReturnType<typeof updateCaptureSchedule> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${body.idempotencyKey} FOR UPDATE`;
    pending = updateCaptureSchedule(
      { id: first.body.schedule.id, request: body },
      { ...actor(), clock: { now: () => now } },
    );
    void pending.catch(() => undefined);
    await waitForLock('IdempotencyRecord', 'UPDATE');
    now = lifecycleAt(120_000);
  });
  await expect(pending).rejects.toMatchObject({ statusCode: 409 });
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each(['edit', 'cancel'] as const)(
  'a real worker claim that wins during %s Event wait cannot be resurrected',
  async (kind) => {
    const first = await create();
    const body = UpdateCaptureScheduleRequest.parse(updateInput());
    await reserve(body.idempotencyKey, {
      endpoint:
        kind === 'edit' ? 'setting.capture.schedule.update' : 'setting.capture.schedule.cancel',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    });
    let pending: Promise<unknown> | undefined;
    let claims: Awaited<ReturnType<typeof claimDueActions>> = [];
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending =
        kind === 'edit'
          ? updateCaptureSchedule({ id: first.body.schedule.id, request: body }, actor())
          : cancelCaptureSchedule(
              {
                id: first.body.schedule.id,
                request: CancelCaptureScheduleRequest.parse(
                  cancelInput({ idempotencyKey: body.idempotencyKey }),
                ),
              },
              actor(),
            );
      void pending.catch(() => undefined);
      await waitForLock('Event', 'UPDATE');
      claims = await claimDueActions({
        types: ['setting.apply'],
        workerId: 'claim-winner',
        clock: fixedClock(lifecycleAt(60_000)),
      });
      expect(claims).toHaveLength(1);
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 409 });
    const registry = new HandlerRegistry(settingsScheduledHandlers);
    expect(
      await runClaimedAction({
        claim: claims[0]!,
        registry,
        clock: fixedClock(lifecycleAt(60_000)),
      }),
    ).toBe('SUCCEEDED');
    expect(await effects()).toEqual([1, 1, 0]);
  },
);
it.each(['list', 'replay'] as const)(
  'returns fresh status and clock after %s Event wait',
  async (kind) => {
    const first = await create();
    const body = UpdateCaptureScheduleRequest.parse(updateInput());
    expect((await edit(first.body.schedule.id, body)).status).toBe(200);
    let now = lifecycleAt(0);
    let pending:
      | ReturnType<typeof listCaptureSchedules>
      | ReturnType<typeof readCaptureScheduleMutation>
      | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending =
        kind === 'list'
          ? listCaptureSchedules(CaptureScheduleListQuery.parse({}), {
              ...actor(),
              clock: { now: () => now },
            })
          : readCaptureScheduleMutation(
              {
                id: first.body.schedule.id,
                mutationVersion: 2,
                action: 'schedule.update',
                request: body,
              },
              { ...actor(), clock: { now: () => now } },
            );
      void pending.catch(() => undefined);
      await waitForLock('Event', 'SHARE');
      now = lifecycleAt(180_000);
      await tx.scheduledAction.update({
        where: { id: first.body.schedule.id },
        data: { status: 'CANCELLED', version: 3, completedAt: now },
      });
      await tx.setting.create({
        data: {
          eventId: f.eventId,
          scope: 'EVENT',
          scopeId: f.eventId,
          key: 'capture.open',
          value: false,
          version: 9,
        },
      });
    });
    const response = await pending;
    if (response && 'data' in response) {
      expect(response.data[0]).toMatchObject({ status: 'CANCELLED', version: 3 });
      expect(response.evaluatedAt).toBe(now.toISOString());
    } else {
      expect(response?.schedule).toMatchObject({ status: 'CANCELLED', version: 3 });
      expect(response?.current.evaluatedAt).toBe(now.toISOString());
      expect(response?.current.data.find((row) => row.key === 'capture.open')).toMatchObject({
        storedVersion: 9,
        value: false,
      });
    }
  },
);
