import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ScopedSettingsMutationRequest,
  ScopedSettingsMutationResponse,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { mutateScopedSetting } from '../../src/modules/settings/application/mutateScopedSetting.js';
import { readScopedMutation } from '../../src/modules/settings/application/readScopedMutation.js';
import { toScopedMutationReceipt } from '../../src/modules/settings/domain/scopedMutationReceipt.js';
import { prisma } from '../../src/platform/db/client.js';
import { admitCountCapture } from '../../src/platform/db/countCaptureAdmission.js';
import { admitCapture } from '../../src/platform/db/captureAdmission.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, testEvent } from '../helpers/fixtures.js';
import {
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue`;
const input = (patch = {}) => ({
  operation: 'set',
  target: { scope: 'event' },
  key: 'silentStationMinutes',
  value: 20,
  expectedVersion: 0,
  reason: 'Reviewed synthetic configuration',
  idempotencyKey: randomUUID(),
  ...patch,
});
const post = (body: object) =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
const selected = (body: { current: { data: Array<{ key: string }> } }, key: string) =>
  body.current.data.find((row) => row.key === key);
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: {
    ...SYSTEM_AUDIT_CONTEXT,
    eventId: f.eventId,
    actorId: f.creator.id,
    membershipId: f.membershipId,
  },
});
const effects = async () =>
  Promise.all([
    rawDb.setting.count({ where: { eventId: f.eventId } }),
    rawDb.settingChange.count({ where: { eventId: f.eventId } }),
    // A refusal is recorded in the security audit; it changes nothing (P11.5).
    rawDb.auditLog.count({
      where: { eventId: f.eventId, action: { not: 'authorization.denied' } },
    }),
    rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } }),
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

it('creates a reviewed event override with its history, audit and identifier-only retry receipt', async () => {
  const body = input();
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(ScopedSettingsMutationResponse.parse(response.body).current.data).toHaveLength(14);
  expect(response.body.change).toMatchObject({
    key: body.key,
    operation: 'set',
    version: 1,
  });
  expect(selected(response.body, body.key)).toMatchObject({
    value: 20,
    storedVersion: 1,
    source: { scope: 'event', version: 1 },
  });
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(1);
  expect(
    await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'setting.change' } }),
  ).toBe(1);
  const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({
    where: { key: body.idempotencyKey },
  });
  expect(receipt.statusCode).toBe(200);
  expect(JSON.stringify(receipt.responseBody)).not.toContain(body.reason);
  expect(JSON.stringify(receipt.responseBody)).not.toContain('"value"');
  expect(receipt.responseBody).toEqual({
    historyId: response.body.change.id,
    key: body.key,
    target: body.target,
    expectedVersion: 0,
  });
  const history = await rawDb.settingChange.findFirstOrThrow({
    where: { id: response.body.change.id, eventId: f.eventId },
  });
  expect(history).toMatchObject({
    actorPersonId: f.creator.id,
    source: 'USER',
    reason: body.reason,
    after: 20,
  });
  expect(
    await rawDb.auditLog.findFirstOrThrow({
      where: { eventId: f.eventId, action: 'setting.change' },
    }),
  ).toMatchObject({
    actorId: f.creator.id,
    actorSub: f.creator.sub,
    membershipId: f.membershipId,
  });
});
it('pauses the selected station through the real count-admission consumer and resets to inheritance', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  const target = { scope: 'station', stationId: f.stationId };
  const body = input({ target, key: 'capture.open', value: false });
  expect((await post(body)).status).toBe(200);
  const admit = () =>
    prisma.$transaction((tx) =>
      admitCountCapture(
        tx,
        { eventId: f.eventId },
        { stationId: f.stationId, clock: fixedClock(lifecycleNow) },
      ),
    );
  await expect(admit()).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    prisma.$transaction((tx) =>
      admitCapture(tx, { eventId: f.eventId }, { clock: fixedClock(lifecycleNow) }),
    ),
  ).resolves.toMatchObject({ rehearsal: true });
  const reset = await post({
    operation: 'reset',
    target,
    key: 'capture.open',
    expectedVersion: 1,
    reason: 'Restore inherited synthetic capture policy',
    idempotencyKey: randomUUID(),
  });
  expect(reset.status).toBe(200);
  expect(reset.body.change).toMatchObject({ operation: 'reset', version: 2 });
  expect(selected(reset.body, 'capture.open')).toMatchObject({
    value: true,
    storedVersion: 0,
    source: { scope: 'default', version: 0 },
  });
  await expect(admit()).resolves.toMatchObject({ rehearsal: true });
  const again = await post(input({ target, key: 'capture.open', value: true }));
  expect(again.status).toBe(200);
  expect(again.body.change.version).toBe(3);
});

it('normalises registered text and accepts bounded enum arrays and fractional thresholds', async () => {
  const response = await post(
    input({
      key: 'vocabulary.missionCard',
      value: '  Journey card  ',
      reason: '  Reviewed label  ',
    }),
  );
  expect(response.status).toBe(200);
  expect(selected(response.body, 'vocabulary.missionCard')).toMatchObject({
    value: 'Journey card',
  });
  for (const patch of [
    { key: 'incident.pushSeverities', value: ['HIGH', 'CRITICAL'] },
    { key: 'implausibleTapsPerMinute', value: 2.5 },
  ])
    expect((await post(input(patch))).status).toBe(200);
});
it('uses the selected stored version rather than the inherited source version', async () => {
  await rawDb.setting.create({
    data: {
      scope: 'EVENT',
      scopeId: f.eventId,
      eventId: f.eventId,
      key: 'silentStationMinutes',
      value: 25,
      version: 4,
    },
  });
  const target = { scope: 'station', stationId: f.stationId };
  const wrong = await post(input({ target, expectedVersion: 4 }));
  expect(wrong.status).toBe(409);
  expect(wrong.body.error.code).toBe('SETTING_VERSION_CONFLICT');
  const response = await post(input({ target }));
  expect(response.status).toBe(200);
  expect(response.body.current.data).toHaveLength(3);
  expect(
    await rawDb.settingChange.findFirstOrThrow({
      where: {
        eventId: f.eventId,
        scope: 'STATION',
        scopeId: f.stationId,
        key: 'silentStationMinutes',
      },
    }),
  ).toMatchObject({ before: 25, after: 20 });
  const reset = await post({
    operation: 'reset',
    target,
    key: 'silentStationMinutes',
    expectedVersion: 1,
    reason: 'Use the event value',
    idempotencyKey: randomUUID(),
  });
  expect(reset.status).toBe(200);
  expect(selected(reset.body, 'silentStationMinutes')).toMatchObject({
    value: 25,
    storedVersion: 0,
    source: { scope: 'event', version: 4 },
  });
  expect(
    await rawDb.setting.findFirstOrThrow({
      where: { eventId: f.eventId, scope: 'EVENT', key: 'silentStationMinutes' },
    }),
  ).toMatchObject({ value: 25, version: 4 });
});
it('replays one intent after later changes/reset using current values and immutable applied metadata', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(200);
  expect((await post(input({ value: 30, expectedVersion: 1 }))).status).toBe(200);
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.body.change).toEqual(first.body.change);
  expect(selected(replay.body, body.key)).toMatchObject({ value: 30, storedVersion: 2 });
  const resetBody = {
    operation: 'reset',
    target: body.target,
    key: body.key,
    expectedVersion: 2,
    reason: 'Restore inheritance',
    idempotencyKey: randomUUID(),
  };
  expect((await post(resetBody)).status).toBe(200);
  expect((await post(input({ value: 18 }))).body.change.version).toBe(4);
  const resetReplay = await post(resetBody);
  expect(resetReplay.status).toBe(200);
  expect(resetReplay.body.change).toMatchObject({ operation: 'reset', version: 3 });
  expect(selected(resetReplay.body, body.key)).toMatchObject({ value: 18, storedVersion: 4 });
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(4);
});
it('rejects semantic retry-key reuse for another value, reason, key, review, scope or operation', async () => {
  const body = input();
  expect((await post(body)).status).toBe(200);
  for (const patch of [
    { value: 25 },
    { reason: 'Another intent' },
    { key: 'staleDeviceMinutes' },
    { expectedVersion: 1 },
    { target: { scope: 'station', stationId: f.stationId } },
  ]) {
    const response = await post({ ...body, ...patch });
    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
  }
  const { value: _value, ...withoutValue } = body;
  expect((await post({ ...withoutValue, operation: 'reset' })).status).toBe(409);
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(1);
});
it('accepts an equivalent normalised retry but never reuses another actor or event receipt', async () => {
  const body = input({ key: 'vocabulary.missionCard', value: ' Card ', reason: ' Review label ' });
  expect((await post(body)).status).toBe(200);
  expect((await post({ ...body, value: 'Card', reason: 'Review label' })).status).toBe(200);
  const other = await createVolunteer({
    email: 'other-setting-manager@test.invalid',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'ADMIN' },
  });
  const foreignActor = await request(app)
    .post(endpoint())
    .set('Authorization', bearer(other))
    .send(body);
  expect(foreignActor.status).toBe(409);
  const base = await testEvent();
  const foreignEvent = await request(app)
    .post(`/api/v1/events/${base.eventId}/admin/settings/catalogue`)
    .set('Authorization', bearer(f.creator))
    .send(body);
  expect(foreignEvent.status).toBe(409);
  expect(foreignEvent.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
});
it('rejects stale and simultaneous reviews without duplicate history', async () => {
  const responses = await Promise.all([post(input()), post(input({ value: 25 }))]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const stale = await post(input({ value: 30 }));
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe('SETTING_VERSION_CONFLICT');
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(1);
});
it('concurrent copies of one intent can retry to the same effect', async () => {
  const body = input();
  const responses = await Promise.all([post(body), post(body)]);
  expect(responses.some((response) => response.status === 200)).toBe(true);
  expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
  expect((await post(body)).status).toBe(200);
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(1);
});
it.each(['missing', 'foreign'] as const)(
  'refuses a %s station without disclosing or altering its settings',
  async (kind) => {
    const other = await createStation({ code: 'FOREIGN-SCOPE' });
    const response = await post(
      input({ target: { scope: 'station', stationId: kind === 'missing' ? 'missing' : other.id } }),
    );
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await effects()).toEqual([0, 0, 0, 0]);
  },
);
it('repairs a reviewed malformed selected override without forwarding its JSON', async () => {
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'silentStationMinutes',
      value: { private: 'unregistered-private-marker' },
      version: 7,
    },
  });
  const body = input({ expectedVersion: 7 });
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(response.body.change.version).toBe(8);
  expect(response.text).not.toContain('unregistered-private-marker');
  expect(
    JSON.stringify(await rawDb.auditLog.findMany({ where: { eventId: f.eventId } })),
  ).not.toContain('unregistered-private-marker');
  expect(selected(response.body, 'silentStationMinutes')).toMatchObject({
    value: 20,
    storedVersion: 8,
    invalidScopes: [],
  });
  expect(
    JSON.stringify(
      (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
        .responseBody,
    ),
  ).not.toContain('unregistered-private-marker');
});
it('cannot overwrite a malformed mixed-event row sharing the target unique key', async () => {
  const other = await testEvent();
  await rawDb.setting.create({
    data: {
      eventId: other.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'silentStationMinutes',
      value: 40,
      version: 4,
    },
  });
  const response = await post(input());
  expect(response.status).toBe(409);
  expect(
    await rawDb.setting.findFirstOrThrow({
      where: { scopeId: f.eventId, key: 'silentStationMinutes' },
    }),
  ).toMatchObject({ eventId: other.eventId, value: 40, version: 4 });
  expect(await effects()).toEqual([0, 0, 0, 0]);
});
it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED'] as const)(
  'allows an operational review in %s without reopening capture',
  async (status) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    expect((await post(input())).status).toBe(200);
    expect((await f.state()).status).toBe(status);
  },
);
it('refuses new archived writes/reset but permits a current-authority historical replay', async () => {
  const body = input();
  const first = await post(body);
  expect(first.status).toBe(200);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  for (const requestBody of [
    input({ expectedVersion: 1 }),
    {
      operation: 'reset',
      target: body.target,
      key: body.key,
      expectedVersion: 1,
      reason: 'Attempt archived reset',
      idempotencyKey: randomUUID(),
    },
  ]) {
    const response = await post(requestBody);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SETTING_LOCKED');
  }
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.body.current.eventStatus).toBe('ARCHIVED');
  expect(await effects()).toEqual([1, 1, 1, 1]);
});

it.each(['set', 'reset'] as const)(
  'rolls back every %s effect if its audit cannot commit',
  async (operation) => {
    if (operation === 'reset') expect((await post(input())).status).toBe(200);
    const before = await effects();
    const { value: _value, ...reset } = input({ operation: 'reset', expectedVersion: 1 });
    const body = operation === 'set' ? input() : reset;
    await rawDb.$executeRawUnsafe(
      `CREATE FUNCTION spoh_test_fail_operational_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'setting.change' THEN RAISE EXCEPTION 'synthetic operational audit rollback'; END IF; RETURN NEW; END $$`,
    );
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER spoh_test_fail_operational_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION spoh_test_fail_operational_audit()',
    );
    try {
      const response = await post(body);
      expect(response.status).toBe(500);
      expect(await effects()).toEqual(before);
      const stored = await rawDb.setting.findFirst({
        where: { eventId: f.eventId, key: 'silentStationMinutes' },
      });
      if (operation === 'reset') expect(stored).toMatchObject({ value: 20, version: 1 });
      else expect(stored).toBeNull();
    } finally {
      await rawDb.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS spoh_test_fail_operational_audit ON "AuditLog"',
      );
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS spoh_test_fail_operational_audit()');
    }
  },
);
it('rolls back the already-written setting/history/audit when atomic receipt settlement fails', async () => {
  const body = input();
  await rawDb.$executeRawUnsafe(
    `CREATE FUNCTION spoh_test_fail_operational_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."statusCode" = 200 AND NEW.endpoint = 'setting.operational.change' THEN RAISE EXCEPTION 'synthetic operational receipt rollback'; END IF; RETURN NEW; END $$`,
  );
  await rawDb.$executeRawUnsafe(
    'CREATE TRIGGER spoh_test_fail_operational_receipt BEFORE UPDATE ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION spoh_test_fail_operational_receipt()',
  );
  try {
    expect((await post(body)).status).toBe(500);
    expect(await effects()).toEqual([0, 0, 0, 0]);
  } finally {
    await rawDb.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS spoh_test_fail_operational_receipt ON "IdempotencyRecord"',
    );
    await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS spoh_test_fail_operational_receipt()');
  }
});
it.each(['authority', 'phase', 'station', 'version', 'clock'] as const)(
  'observes committed %s after waiting for Event and samples the later clock',
  async (condition) => {
    const body = ScopedSettingsMutationRequest.parse(
      input(
        condition === 'station' ? { target: { scope: 'station', stationId: f.stationId } } : {},
      ),
    );
    expect(
      await reserve(body.idempotencyKey, {
        endpoint: 'setting.operational.change',
        actorSub: f.creator.sub,
        eventId: f.eventId,
      }),
    ).toBeNull();
    let pending: ReturnType<typeof mutateScopedSetting> | undefined;
    let now = lifecycleNow;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = mutateScopedSetting(body, { ...actor(), clock: { now: () => now } });
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      now = new Date(lifecycleNow.getTime() + 60_000);
      if (condition === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else if (condition === 'phase')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
      else if (condition === 'station') await tx.station.delete({ where: { id: f.stationId } });
      else if (condition === 'version')
        await tx.setting.create({
          data: {
            scope: 'EVENT',
            scopeId: f.eventId,
            eventId: f.eventId,
            key: 'silentStationMinutes',
            value: 25,
            version: 3,
          },
        });
    });
    if (condition === 'clock') {
      const response = await pending;
      expect(response?.current.evaluatedAt).toBe(now.toISOString());
      expect(response?.change.version).toBe(1);
    } else {
      await expect(pending).rejects.toMatchObject({
        statusCode: condition === 'authority' ? 403 : condition === 'station' ? 404 : 409,
      });
      expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(0);
    }
  },
);
it('rechecks deactivation after waiting for the exact membership lock', async () => {
  const body = ScopedSettingsMutationRequest.parse(input());
  expect(
    await reserve(body.idempotencyKey, {
      endpoint: 'setting.operational.change',
      actorSub: f.creator.sub,
      eventId: f.eventId,
    }),
  ).toBeNull();
  let pending: ReturnType<typeof mutateScopedSetting> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    pending = mutateScopedSetting(body, actor());
    void pending.catch(() => undefined);
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    await tx.eventMembership.update({
      where: { id: f.membershipId },
      data: { status: 'DEACTIVATED' },
    });
  });
  await expect(pending).rejects.toMatchObject({ statusCode: 403 });
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(0);
});
it('refuses resetting an inherited or stale selected scope', async () => {
  const body = {
    operation: 'reset',
    target: { scope: 'event' },
    key: 'silentStationMinutes',
    reason: 'Reset selected override',
    idempotencyKey: randomUUID(),
    expectedVersion: 0,
  };
  expect((await post(body)).status).toBe(409);
  expect((await post(input())).status).toBe(200);
  expect((await post({ ...body, idempotencyKey: randomUUID(), expectedVersion: 2 })).status).toBe(
    409,
  );
  expect(await effects()).toEqual([1, 1, 1, 1]);
});
it('rejects anonymous/non-manager callers and malformed or guarded payloads before any effect', async () => {
  const anonymous = await request(app).post(endpoint()).send(input());
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const person = await createVolunteer({
    email: 'scoped-setting-reader@test.invalid',
    role: 'VOLUNTEER',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role: 'VOLUNTEER' },
  });
  expect(
    (await request(app).post(endpoint()).set('Authorization', bearer(person)).send(input())).status,
  ).toBe(403);
  for (const patch of [
    { key: 'product.countsMode', value: { mode: 'separate' } },
    { key: 'product.visitorDataMode', value: 'none' },
    { key: 'lostPersonPurgeHours', value: 1 },
    { key: 'attendance.campusCidrs', value: [] },
    { key: 'rateLimit.max.default', value: 1 },
    { key: 'eventName', value: 'Changed' },
    { target: { scope: 'platform' } },
    { target: { scope: 'station', stationId: f.stationId }, key: 'longShiftMinutes' },
    { value: 0 },
    { value: { private: 'unregistered' } },
    { expectedVersion: -1 },
    { reason: ' ' },
    { idempotencyKey: 'invalid' },
    { operation: 'reset' },
    { actorId: 'forged' },
    { source: 'SCHEDULE' },
  ]) {
    const response = await post(input(patch));
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual([0, 0, 0, 0]);
});
it.each(['demoted', 'DEACTIVATED', 'ENDED'] as const)(
  'rechecks %s authority for fresh writes and completed replays',
  async (kind) => {
    const body = input();
    const first = await post(body);
    expect(first.status).toBe(200);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: kind === 'demoted' ? { role: 'VOLUNTEER' } : { status: kind },
    });
    await expect(
      mutateScopedSetting(
        ScopedSettingsMutationRequest.parse(input({ expectedVersion: 1 })),
        actor(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      readScopedMutation(
        toScopedMutationReceipt(first.body),
        ScopedSettingsMutationRequest.parse(body),
        actor(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await post(body)).status).toBe(403);
    expect(await effects()).toEqual([1, 1, 1, 1]);
  },
);
