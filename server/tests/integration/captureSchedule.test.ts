import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureScheduleResponse, CreateCaptureScheduleRequest } from '@spoh/shared';
import { settingsScheduledHandlers } from '../../src/modules/settings/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { admitCountCapture } from '../../src/platform/db/countCaptureAdmission.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import * as audit from '../../src/platform/audit/index.js';
import { createCaptureSchedule } from '../../src/modules/settings/application/createCaptureSchedule.js';
import { readCaptureSchedule } from '../../src/modules/settings/application/readCaptureSchedule.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, createStation, testEvent } from '../helpers/fixtures.js';
import {
  lifecycleAt,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue/schedules`;
const input = (patch = {}) => ({
  target: { scope: 'event' },
  key: 'capture.open',
  value: false,
  expectedVersion: 0,
  runAt: lifecycleAt(60_000).toISOString(),
  reason: 'Reviewed synthetic pause',
  idempotencyKey: randomUUID(),
  ...patch,
});
const post = (body: object) =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
const get = (id: string) =>
  request(app).get(`${endpoint()}/${id}`).set('Authorization', bearer(f.creator));
const registry = new HandlerRegistry(settingsScheduledHandlers);
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
const run = async (now = lifecycleAt(60_000)) => {
  const claims = await claimDueActions({
    types: registry.types(),
    workerId: 'capture-producer-test',
    clock: fixedClock(now),
  });
  expect(claims).toHaveLength(1);
  return runClaimedAction({ claim: claims[0]!, registry, clock: fixedClock(now) });
};
const effects = async () =>
  Promise.all([
    rawDb.scheduledAction.count({ where: { eventId: f.eventId } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'schedule.create' } }),
    rawDb.settingChange.count({ where: { eventId: f.eventId } }),
  ]);
beforeEach(async () => {
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
it.each([
  { key: 'silentStationMinutes', value: 12 },
  { key: 'vocabulary.missionCard', value: 'Journey Card' },
  { key: 'incident.pushSeverities', value: ['CRITICAL'] },
])('creates, reads and executes a generated operational $key schedule', async (patch) => {
  const response = await post(input(patch));
  expect(response.status).toBe(201);
  const parsed = CaptureScheduleResponse.parse(response.body);
  expect(parsed.schedule).toMatchObject(patch);
  expect(await run()).toBe('SUCCEEDED');
  expect(
    await rawDb.setting.findFirst({ where: { eventId: f.eventId, key: patch.key } }),
  ).toMatchObject({ value: patch.value, version: 1 });
  const list = await request(app)
    .get(`${endpoint()}?scope=event&key=${patch.key}`)
    .set('Authorization', bearer(f.creator));
  expect(list.status).toBe(200);
  expect(list.body.data).toEqual([
    expect.objectContaining({ id: parsed.schedule.id, key: patch.key, status: 'SUCCEEDED' }),
  ]);
});
it('creates a reviewed future capture schedule without changing capture now', async () => {
  const response = await post(input());
  expect(response.status).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.schedule).toMatchObject({
    key: 'capture.open',
    value: false,
    expectedVersion: 0,
    status: 'PENDING',
  });
  expect(await rawDb.setting.count({ where: { eventId: f.eventId } })).toBe(0);
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(0);
});
it.each(['event', 'station'] as const)(
  'executes the public %s producer through the real worker once',
  async (scope) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
    const target = scope === 'event' ? { scope } : { scope, stationId: f.stationId };
    const body = input({ target, reason: '  Reviewed synthetic pause  ' });
    const first = await post(body);
    expect(first.status).toBe(201);
    const parsed = CaptureScheduleResponse.parse(first.body);
    expect(parsed.schedule).toMatchObject({
      target,
      createdByYou: true,
      recurring: false,
      reason: 'Reviewed synthetic pause',
    });
    const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({
      where: { key: body.idempotencyKey },
    });
    expect(receipt.responseBody).toEqual({ scheduledActionId: parsed.schedule.id });
    expect(await effects()).toEqual([1, 1, 0]);
    expect(
      await claimDueActions({
        types: registry.types(),
        workerId: 'early',
        clock: fixedClock(lifecycleAt(59_999)),
      }),
    ).toEqual([]);
    await expect(
      prisma.$transaction((tx) =>
        admitCountCapture(
          tx,
          { eventId: f.eventId },
          { stationId: f.stationId, clock: fixedClock(lifecycleAt(0)) },
        ),
      ),
    ).resolves.toMatchObject({ rehearsal: true });
    expect(await run()).toBe('SUCCEEDED');
    await expect(
      prisma.$transaction((tx) =>
        admitCountCapture(
          tx,
          { eventId: f.eventId },
          { stationId: f.stationId, clock: fixedClock(lifecycleAt(60_000)) },
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    const status = await get(parsed.schedule.id);
    expect(status.status).toBe(200);
    expect(status.headers['cache-control']).toBe('no-store');
    expect(CaptureScheduleResponse.parse(status.body).schedule.status).toBe('SUCCEEDED');
    expect(
      status.body.current.data.find((row: { key: string }) => row.key === 'capture.open'),
    ).toMatchObject({ value: false, storedVersion: 1 });
    const retry = await post(body);
    expect(retry.status).toBe(201);
    expect(retry.body.schedule.id).toBe(parsed.schedule.id);
    expect(retry.body.schedule.status).toBe('SUCCEEDED');
    expect(await effects()).toEqual([1, 1, 1]);
    expect(
      await rawDb.settingChange.findFirstOrThrow({ where: { eventId: f.eventId } }),
    ).toMatchObject({
      scheduledActionId: parsed.schedule.id,
      actorPersonId: f.creator.id,
      source: 'SCHEDULE',
      after: false,
    });
    expect(
      await rawDb.auditLog.findFirstOrThrow({
        where: { eventId: f.eventId, action: 'schedule.create' },
      }),
    ).toMatchObject({
      actorId: f.creator.id,
      actorSub: f.creator.sub,
      membershipId: f.membershipId,
      source: 'USER',
    });
  },
);
it.each([
  { key: 'product.countsMode' },
  { key: 'product.visitorDataMode' },
  { key: 'rateLimit.max.admin' },
  { key: 'silentStationMinutes' },
  { value: 'false' },
  { value: null },
  { operation: 'reset' },
  { target: { scope: 'platform', organisationId: 'other' } },
  { eventId: 'other' },
  { source: 'SYSTEM' },
  { createdByPersonId: 'other' },
  { recurrence: {} },
  { maxAttempts: 20 },
  { expectedVersion: -1 },
  { reason: ' x ' },
  { reason: 'x'.repeat(501) },
  { runAt: '2027-01-07T12:00' },
])('refuses unsupported or forged producer fields %j', async (patch) => {
  const response = await post(input(patch));
  expect(response.status).toBe(400);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each([-1, 0])('refuses a due/past instant at offset %i', async (offset) => {
  expect((await post(input({ runAt: lifecycleAt(offset).toISOString() }))).status).toBe(409);
  expect(await effects()).toEqual([0, 0, 0]);
});
it('uses the station stored version, excluding its inherited event version', async () => {
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
  const target = { scope: 'station', stationId: f.stationId };
  expect((await post(input({ target, expectedVersion: 7 }))).status).toBe(409);
  const response = await post(input({ target }));
  expect(response.status).toBe(201);
  expect(
    response.body.current.data.find((row: { key: string }) => row.key === 'capture.open'),
  ).toMatchObject({
    value: true,
    storedVersion: 0,
    source: { scope: 'event', version: 7 },
  });
  expect(await effects()).toEqual([1, 1, 0]);
});
it('refuses stale selected versions and archived creation while preserving read-only retry', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(201);
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'capture.open',
      value: true,
      version: 4,
    },
  });
  expect((await post(input())).status).toBe(409);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  expect((await post(input({ expectedVersion: 4 }))).status).toBe(409);
  expect((await post(body)).status).toBe(201);
  expect((await get(first.body.schedule.id)).status).toBe(200);
  expect(await effects()).toEqual([1, 1, 0]);
});
it.each([
  { value: true },
  { target: { scope: 'station', stationId: 'different' } },
  { expectedVersion: 1 },
  { reason: 'Different reason' },
  { runAt: lifecycleAt(120_000).toISOString() },
])('binds retries to the immutable creation intent %j', async (patch) => {
  const body = input();
  expect((await post(body)).status).toBe(201);
  expect((await post({ ...body, ...patch })).status).toBe(409);
  expect(await effects()).toEqual([1, 1, 0]);
});
it('retries an equivalent normalised instant/reason without replacing a later pending definition', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(201);
  const original = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId: f.eventId, action: 'schedule.create' },
  });
  await rawDb.scheduledAction.update({
    where: { id: first.body.schedule.id },
    data: {
      payload: {
        scope: 'event',
        scopeId: f.eventId,
        key: 'capture.open',
        value: true,
        expectedVersion: 0,
        reason: 'Later reviewed edit',
      },
      runAt: lifecycleAt(120_000),
      scheduledFor: lifecycleAt(120_000),
      version: 2,
    },
  });
  const retry = await post({
    ...body,
    runAt: '2027-01-07T11:31:00+08:00',
    reason: `  ${body.reason}  `,
  });
  expect(retry.status).toBe(201);
  expect(retry.body.schedule).toMatchObject({
    version: 2,
    value: true,
    reason: 'Later reviewed edit',
    scheduledFor: lifecycleAt(120_000).toISOString(),
  });
  expect(await rawDb.auditLog.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  expect(await effects()).toEqual([1, 1, 0]);
});
it('rolls back the queued action and receipt when its audit fails', async () => {
  const failure = vi
    .spyOn(audit, 'writeAudit')
    .mockRejectedValueOnce(new Error('Injected audit outage'));
  try {
    expect((await post(input())).status).toBe(500);
  } finally {
    failure.mockRestore();
  }
  expect(await effects()).toEqual([0, 0, 0]);
  await expect.poll(() => rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(0);
});
it('isolates foreign stations and action ids, and rejects forged query parameters', async () => {
  const foreign = await createStation({ code: 'FOREIGN-CAPTURE' });
  expect((await post(input({ target: { scope: 'station', stationId: foreign.id } }))).status).toBe(
    404,
  );
  const source = await testEvent();
  const action = await rawDb.scheduledAction.create({
    data: {
      eventId: source.eventId,
      type: 'setting.apply',
      payload: {
        scope: 'event',
        scopeId: source.eventId,
        key: 'capture.open',
        value: false,
        expectedVersion: 0,
      },
      runAt: lifecycleAt(60_000),
    },
  });
  expect((await get(action.id)).status).toBe(404);
  expect((await get('missing')).status).toBe(404);
  const own = await post(input());
  expect(own.status).toBe(201);
  expect((await get(`${own.body.schedule.id}?eventId=${source.eventId}`)).status).toBe(400);
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject(
    { eventId: source.eventId, status: 'PENDING' },
  );
});
it('returns private no-store denial for anonymous reads and writes', async () => {
  for (const response of [
    await request(app).post(endpoint()).send(input()),
    await request(app).get(`${endpoint()}/missing`),
  ]) {
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual([0, 0, 0]);
});
it.each(['role', 'DEACTIVATED', 'ENDED'] as const)(
  'rechecks current authority for creation/status/replay after %s',
  async (change) => {
    const body = input();
    const own = await post(body);
    expect(own.status).toBe(201);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: change === 'role' ? { role: 'VOLUNTEER' } : { status: change },
    });
    expect((await post(input())).status).toBe(403);
    expect((await post(body)).status).toBe(403);
    expect((await get(own.body.schedule.id)).status).toBe(403);
    expect(await effects()).toEqual([1, 1, 0]);
  },
);
it('allows another current manager to read status with bounded attribution, but not reuse a creator receipt', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(201);
  const other = await createVolunteer({
    email: 'other-capture-manager@test.example',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'ADMIN' },
  });
  const read = await request(app)
    .get(`${endpoint()}/${first.body.schedule.id}`)
    .set('Authorization', bearer(other));
  expect(read.status).toBe(200);
  expect(read.body.schedule.createdByYou).toBe(false);
  expect(JSON.stringify(read.body)).not.toContain(f.creator.id);
  expect(
    (await request(app).post(endpoint()).set('Authorization', bearer(other)).send(body)).status,
  ).toBe(409);
});
it.each(['payload', 'reason', 'audit', 'event scope', 'recurring'] as const)(
  'omits malformed or unsupported owned stored %s',
  async (kind) => {
    const first = await post(input());
    expect(first.status).toBe(201);
    if (kind === 'audit')
      await rawDb.auditLog.updateMany({
        where: { eventId: f.eventId, action: 'schedule.create' },
        data: { after: { secret: 'private-storage-marker' } },
      });
    else
      await rawDb.scheduledAction.update({
        where: { id: first.body.schedule.id },
        data:
          kind === 'recurring'
            ? { recurrence: 60 }
            : {
                payload: {
                  scope: 'event',
                  scopeId: kind === 'event scope' ? 'foreign' : f.eventId,
                  key: 'capture.open',
                  value: kind === 'payload' ? 'private-storage-marker' : false,
                  expectedVersion: 0,
                  ...(kind === 'reason' ? {} : { reason: 'Reviewed synthetic pause' }),
                },
              },
      });
    const read = await get(first.body.schedule.id);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain('private-storage-marker');
  },
);
it.each(['authority', 'archive', 'version'] as const)(
  'refuses a publicly queued action whose %s changes before execution',
  async (change) => {
    const first = await post(input());
    expect(first.status).toBe(201);
    if (change === 'authority')
      await rawDb.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    else if (change === 'archive')
      await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
    else
      await rawDb.setting.create({
        data: {
          eventId: f.eventId,
          scope: 'EVENT',
          scopeId: f.eventId,
          key: 'capture.open',
          value: true,
          version: 1,
        },
      });
    expect(await run()).toBe('FAILED');
    expect(
      await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }),
    ).toMatchObject({
      status: 'FAILED',
      lastError: change === 'authority' ? 'AUTHORITY_CHANGED' : 'GUARD_FAILED',
    });
    expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(0);
  },
);
it('returns only a bounded fallback for a raw worker failure without changing the stored detail', async () => {
  const first = await post(input());
  expect(first.status).toBe(201);
  await rawDb.scheduledAction.update({
    where: { id: first.body.schedule.id },
    data: {
      status: 'FAILED',
      completedAt: lifecycleAt(60_000),
      lastError: 'private-storage-marker',
    },
  });
  const status = await get(first.body.schedule.id);
  expect(status.status).toBe(200);
  expect(status.body.schedule.lastError).toBe('EXECUTION_FAILED');
  expect(JSON.stringify(status.body)).not.toContain('private-storage-marker');
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: first.body.schedule.id } }))
      .lastError,
  ).toBe('private-storage-marker');
});
it.each(['archive', 'authority', 'station', 'version', 'clock'] as const)(
  'rechecks %s after its creation Event lock wait',
  async (condition) => {
    const body = CreateCaptureScheduleRequest.parse(
      input(
        condition === 'station' ? { target: { scope: 'station', stationId: f.stationId } } : {},
      ),
    );
    await reserve(body.idempotencyKey, {
      endpoint: 'setting.capture.schedule',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    });
    let pending: ReturnType<typeof createCaptureSchedule> | undefined;
    let now = lifecycleAt(0);
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = createCaptureSchedule(body, { ...actor(), clock: { now: () => now } });
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      if (condition === 'archive')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
      else if (condition === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else if (condition === 'station') await tx.station.delete({ where: { id: f.stationId } });
      else if (condition === 'version')
        await tx.setting.create({
          data: {
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key: 'capture.open',
            value: true,
            version: 5,
          },
        });
      else now = lifecycleAt(60_000);
    });
    await expect(pending).rejects.toMatchObject({
      statusCode: condition === 'authority' ? 403 : condition === 'station' ? 404 : 409,
    });
    expect(await effects()).toEqual([0, 0, 0]);
  },
);
it.each(['create', 'read', 'replay'] as const)(
  'rechecks deactivation after its %s exact-member lock wait',
  async (kind) => {
    const body = CreateCaptureScheduleRequest.parse(input());
    const first = kind === 'create' ? null : await post(body);
    if (first) expect(first.status).toBe(201);
    else
      await reserve(body.idempotencyKey, {
        endpoint: 'setting.capture.schedule',
        actorSub: f.creator.sub,
        eventId: f.eventId,
      });
    let pending: ReturnType<typeof readCaptureSchedule> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      pending = first
        ? readCaptureSchedule(
            { id: first.body.schedule.id, ...(kind === 'replay' ? { request: body } : {}) },
            actor(),
          )
        : createCaptureSchedule(body, actor());
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 403 });
    expect(await effects()).toEqual(first ? [1, 1, 0] : [0, 0, 0]);
  },
);
it.each(['read', 'replay'] as const)(
  'rebuilds fresh status, values and clock after the %s Event lock wait',
  async (kind) => {
    const body = CreateCaptureScheduleRequest.parse(input());
    const first = await post(body);
    expect(first.status).toBe(201);
    let pending: ReturnType<typeof readCaptureSchedule> | undefined;
    let now = lifecycleAt(0);
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = readCaptureSchedule(
        { id: first.body.schedule.id, ...(kind === 'replay' ? { request: body } : {}) },
        { ...actor(), clock: { now: () => now } },
      );
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      now = lifecycleAt(120_000);
      await tx.scheduledAction.update({
        where: { id: first.body.schedule.id },
        data: { status: 'CANCELLED', completedAt: now, version: 2 },
      });
      await tx.setting.create({
        data: {
          eventId: f.eventId,
          scope: 'EVENT',
          scopeId: f.eventId,
          key: 'capture.open',
          value: false,
          version: 5,
        },
      });
    });
    const result = await pending;
    expect(result?.schedule).toMatchObject({ status: 'CANCELLED', version: 2 });
    expect(result?.current.evaluatedAt).toBe(now.toISOString());
    expect(result?.current.data.find((row) => row.key === 'capture.open')).toMatchObject({
      value: false,
      storedVersion: 5,
    });
    expect(await effects()).toEqual([1, 1, 0]);
  },
);
it('concurrent copies of one producer intent eventually return one committed action', async () => {
  const body = input();
  const results = await Promise.all([post(body), post(body)]);
  expect(results.some((response) => response.status === 201)).toBe(true);
  expect(results.every((response) => [201, 409].includes(response.status))).toBe(true);
  expect((await post(body)).status).toBe(201);
  expect(await effects()).toEqual([1, 1, 0]);
  expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(1);
});
it('refuses a due instant after waiting on the retry reservation', async () => {
  const body = CreateCaptureScheduleRequest.parse(input());
  await reserve(body.idempotencyKey, {
    endpoint: 'setting.capture.schedule',
    actorSub: f.creator.sub,
    eventId: f.eventId,
  });
  let now = lifecycleAt(0);
  let pending: ReturnType<typeof createCaptureSchedule> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "IdempotencyRecord" WHERE key = ${body.idempotencyKey} FOR UPDATE`;
    pending = createCaptureSchedule(body, { ...actor(), clock: { now: () => now } });
    void pending.catch(() => undefined);
    await expect
      .poll(async () => {
        const waits = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "IdempotencyRecord"%FOR UPDATE%'`;
        return Number(waits[0]!.count);
      })
      .toBeGreaterThan(0);
    now = lifecycleAt(60_000);
  });
  await expect(pending).rejects.toMatchObject({ statusCode: 409 });
  expect(await effects()).toEqual([0, 0, 0]);
});
