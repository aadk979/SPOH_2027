import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  ERROR_CODES,
  ScopedSettingsRevertRequest,
  ScopedSettingsRevertResponse,
} from '@spoh/shared';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createApp } from '../../src/app/createApp.js';
import { revertScopedSetting } from '../../src/modules/settings/application/revertScopedSetting.js';
import { readScopedRevert } from '../../src/modules/settings/application/readScopedRevert.js';
import { toScopedRevertReceipt } from '../../src/modules/settings/domain/scopedRevertReceipt.js';
import { prisma, dbNull } from '../../src/platform/db/client.js';
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
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue/revert`;
const input = (historyId: string, patch = {}) => ({
  target: { scope: 'event' },
  key: 'silentStationMinutes',
  historyId,
  expectedVersion: 0,
  reason: 'Restore reviewed operational history',
  idempotencyKey: randomUUID(),
  ...patch,
});
const post = (body: object) =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
const seedHistory = (patch: Partial<Prisma.SettingChangeUncheckedCreateInput> = {}) =>
  rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'silentStationMinutes',
      version: 1,
      before: 15,
      after: 20,
      source: 'USER',
      actorPersonId: f.creator.id,
      createdAt: lifecycleNow,
      ...patch,
    },
  });
const effects = () =>
  Promise.all([
    rawDb.setting.findMany({ where: { eventId: f.eventId }, orderBy: { id: 'asc' } }),
    rawDb.settingChange.count({ where: { eventId: f.eventId } }),
    rawDb.auditLog.count({ where: { eventId: f.eventId } }),
    rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } }),
    f.state(),
  ]);
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

it('binds a completed retry to the selected history, scope, key, review and normalised reason', async () => {
  const original = await seedHistory();
  const body = input(original.id);
  expect((await post(body)).status).toBe(200);
  const other = await seedHistory({ version: 4, after: 25 });
  const before = await effects();
  expect((await post({ ...body, reason: `  ${body.reason}  ` })).status).toBe(200);
  for (const patch of [
    { historyId: other.id },
    { key: 'capture.open' },
    { expectedVersion: 2 },
    { reason: 'Different restore reason' },
    { target: { scope: 'station', stationId: f.stationId } },
  ]) {
    const response = await post({ ...body, ...patch });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual(before);
});
it('refuses another manager reusing the same retry identity', async () => {
  const original = await seedHistory();
  const body = input(original.id);
  expect((await post(body)).status).toBe(200);
  const other = await createVolunteer({
    email: 'other-operational-restorer@test.invalid',
    role: 'ADMIN',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'ADMIN' },
  });
  const before = await effects();
  const response = await request(app)
    .post(endpoint())
    .set('Authorization', bearer(other))
    .send(body);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
  expect(await effects()).toEqual(before);
});
it.each(['event', 'key', 'scope', 'station', 'mixed-event', 'platform'] as const)(
  'refuses %s history outside the exact owned selection without effects',
  async (kind) => {
    const base = await testEvent();
    const station = await rawDb.station.findUniqueOrThrow({ where: { id: f.stationId } });
    const other = await rawDb.station.create({
      data: { eventId: f.eventId, typeId: station.typeId, code: 'OTHER', name: 'Other' },
    });
    const patch =
      kind === 'event'
        ? { eventId: base.eventId, scopeId: base.eventId }
        : kind === 'key'
          ? { key: 'implausibleTapsPerMinute', before: 2.5, after: 5.5 }
          : kind === 'scope'
            ? { scope: 'STATION' as const, scopeId: f.stationId }
            : kind === 'station'
              ? { scope: 'STATION' as const, scopeId: other.id }
              : kind === 'mixed-event'
                ? { eventId: base.eventId, scopeId: f.eventId }
                : { scope: 'PLATFORM' as const, scopeId: f.organisationId, eventId: null };
    const original = await seedHistory(patch);
    const before = await effects();
    const response = await post(
      input(
        original.id,
        kind === 'station' ? { target: { scope: 'station', stationId: f.stationId } } : {},
      ),
    );
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await effects()).toEqual(before);
    expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
      original,
    );
  },
);
it('refuses missing history and foreign or missing stations before any change', async () => {
  const original = await seedHistory();
  const foreign = await createStation({ code: 'FOREIGN-RESTORE' });
  const before = await effects();
  for (const patch of [
    { historyId: 'missing-history' },
    { target: { scope: 'station', stationId: foreign.id } },
    { target: { scope: 'station', stationId: 'missing-station' } },
  ]) {
    const response = await post(input(original.id, patch));
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual(before);
});
it.each([{ private: 'historical-secret' }, 0, '20'] as const)(
  'refuses unavailable historical results without exposing their JSON',
  async (after) => {
    const original = await seedHistory({ after });
    const before = await effects();
    const response = await post(input(original.id));
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain('historical-secret');
    expect(await effects()).toEqual(before);
    expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
      original,
    );
  },
);
it('does not expose malformed current/before values while restoring a valid historical result', async () => {
  const original = await seedHistory({ before: { private: 'prior-secret' } });
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: original.key,
      value: { private: 'current-secret' },
      version: 2,
    },
  });
  const response = await post(input(original.id, { expectedVersion: 2 }));
  expect(response.status).toBe(200);
  expect(response.body.history.values).toEqual({
    available: true,
    operation: 'set',
    before: null,
    after: 20,
  });
  expect(JSON.stringify(response.body)).not.toContain('secret');
  expect(
    JSON.stringify(await rawDb.auditLog.findMany({ where: { eventId: f.eventId } })),
  ).not.toContain('current-secret');
  expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
    original,
  );
});
it('ignores raw after JSON in reset history and preserves removal semantics', async () => {
  const original = await seedHistory({
    source: 'RESET',
    after: { private: 'not-an-inherited-value' },
  });
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: original.key,
      value: 25,
      version: 2,
    },
  });
  const response = await post(input(original.id, { expectedVersion: 2 }));
  expect(response.status).toBe(200);
  expect(response.body.history.values).toEqual({ available: true, operation: 'reset', before: 25 });
  expect(JSON.stringify(response.body)).not.toContain('not-an-inherited-value');
});
it('serialises competing reviewed restores and rejects stale review with no extra change', async () => {
  const original = await seedHistory();
  const responses = await Promise.all([post(input(original.id)), post(input(original.id))]);
  expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  const stale = await post(input(original.id));
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe(ERROR_CODES.SETTING_VERSION_CONFLICT);
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(2);
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId } })).toBe(1);
});
it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED'] as const)(
  'restores permitted operational history in %s without moving lifecycle',
  async (status) => {
    const original = await seedHistory();
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const before = await f.state();
    const response = await post(input(original.id));
    expect(response.status).toBe(200);
    expect(response.body.current.eventStatus).toBe(status);
    expect(await f.state()).toEqual(before);
  },
);
it('rejects new archived restores while rebuilding an already successful restore retry', async () => {
  const original = await seedHistory();
  const body = input(original.id);
  const first = await post(body);
  expect(first.status).toBe(200);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  const before = await effects();
  const fresh = await post(input(original.id, { expectedVersion: 2 }));
  expect(fresh.status).toBe(409);
  expect(fresh.body.error.code).toBe(ERROR_CODES.SETTING_LOCKED);
  const retry = await post(body);
  expect(retry.status).toBe(200);
  expect(retry.body.history).toEqual(first.body.history);
  expect(retry.body.current.eventStatus).toBe('ARCHIVED');
  expect(await effects()).toEqual(before);
});
it('restores station pause/removal through real count admission while safety capture remains available', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  const original = await seedHistory({
    scope: 'STATION',
    scopeId: f.stationId,
    key: 'capture.open',
    before: true,
    after: false,
  });
  const target = { scope: 'station', stationId: f.stationId };
  const response = await post(input(original.id, { target, key: 'capture.open' }));
  expect(response.status).toBe(200);
  const admit = () =>
    prisma.$transaction((tx) =>
      admitCountCapture(tx, actor().scope, {
        stationId: f.stationId,
        clock: fixedClock(lifecycleNow),
      }),
    );
  await expect(admit()).rejects.toMatchObject({ statusCode: 409 });
  await expect(
    prisma.$transaction((tx) =>
      admitCapture(tx, actor().scope, { clock: fixedClock(lifecycleNow) }),
    ),
  ).resolves.toMatchObject({ rehearsal: true });
  const reset = await seedHistory({
    scope: 'STATION',
    scopeId: f.stationId,
    key: 'capture.open',
    source: 'RESET',
    before: false,
    after: dbNull,
    version: 3,
  });
  const restored = await post(input(reset.id, { target, key: 'capture.open', expectedVersion: 2 }));
  expect(restored.status).toBe(200);
  expect(restored.body.history.version).toBe(4);
  await expect(admit()).resolves.toMatchObject({ rehearsal: true });
});
it('rejects anonymous/non-manager and forged or guarded restore requests before effects', async () => {
  const original = await seedHistory();
  const anonymous = await request(app).post(endpoint()).send(input(original.id));
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const other = await createVolunteer({ email: 'restore-reader@test.invalid', role: 'VOLUNTEER' });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'VOLUNTEER' },
  });
  expect(
    (
      await request(app)
        .post(endpoint())
        .set('Authorization', bearer(other))
        .send(input(original.id))
    ).status,
  ).toBe(403);
  const before = await effects();
  for (const patch of [
    { key: 'product.countsMode' },
    { key: 'product.visitorDataMode' },
    { key: 'attendance.rootMembershipId' },
    { key: 'attendance.campusCidrs' },
    { key: 'lostPersonPurgeHours' },
    { key: 'rateLimit.max.admin' },
    { key: 'eventName' },
    { target: { scope: 'platform' } },
    { target: { scope: 'station', stationId: f.stationId }, key: 'longShiftMinutes' },
    { value: 20 },
    { operation: 'reset' },
    { source: 'REVERT' },
    { actorId: 'forged' },
    { eventId: 'foreign' },
    { historyId: '' },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { reason: ' ' },
    { reason: 'x'.repeat(501) },
    { idempotencyKey: 'invalid' },
  ]) {
    const response = await post(input(original.id, patch));
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual(before);
});
it.each(['demoted', 'DEACTIVATED', 'ENDED'] as const)(
  'rechecks %s authority on direct writes and completed retry reads',
  async (kind) => {
    const original = await seedHistory();
    const body = input(original.id);
    const first = await post(body);
    expect(first.status).toBe(200);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: kind === 'demoted' ? { role: 'VOLUNTEER' } : { status: kind },
    });
    const before = await effects();
    await expect(
      revertScopedSetting(
        ScopedSettingsRevertRequest.parse(input(original.id, { expectedVersion: 2 })),
        actor(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      readScopedRevert(
        toScopedRevertReceipt(first.body),
        ScopedSettingsRevertRequest.parse(body),
        actor(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((await post(body)).status).toBe(403);
    expect(await effects()).toEqual(before);
  },
);
it.each(['set', 'reset'] as const)(
  'rolls back restored %s and history when its audit fails',
  async (operation) => {
    const original = await seedHistory(
      operation === 'reset' ? { source: 'RESET', after: dbNull } : {},
    );
    if (operation === 'reset')
      await rawDb.setting.create({
        data: {
          eventId: f.eventId,
          scope: 'EVENT',
          scopeId: f.eventId,
          key: original.key,
          value: 30,
          version: 2,
        },
      });
    const before = await effects();
    await rawDb.$executeRawUnsafe(
      `CREATE FUNCTION spoh_test_fail_restore_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'setting.change' THEN RAISE EXCEPTION 'synthetic restore audit rollback'; END IF; RETURN NEW; END $$`,
    );
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER spoh_test_fail_restore_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION spoh_test_fail_restore_audit()',
    );
    try {
      expect(
        (await post(input(original.id, { expectedVersion: operation === 'reset' ? 2 : 0 }))).status,
      ).toBe(500);
      expect(await effects()).toEqual(before);
    } finally {
      await rawDb.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS spoh_test_fail_restore_audit ON "AuditLog"',
      );
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS spoh_test_fail_restore_audit()');
    }
  },
);
it.each(['set', 'reset'] as const)(
  'rolls back restored %s/history/audit when receipt settlement fails',
  async (operation) => {
    const original = await seedHistory(
      operation === 'reset' ? { source: 'RESET', after: dbNull } : {},
    );
    if (operation === 'reset')
      await rawDb.setting.create({
        data: {
          eventId: f.eventId,
          scope: 'EVENT',
          scopeId: f.eventId,
          key: original.key,
          value: 30,
          version: 2,
        },
      });
    const before = await effects();
    await rawDb.$executeRawUnsafe(
      `CREATE FUNCTION spoh_test_fail_restore_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."statusCode" = 200 AND NEW.endpoint = 'setting.operational.revert' THEN RAISE EXCEPTION 'synthetic restore receipt rollback'; END IF; RETURN NEW; END $$`,
    );
    await rawDb.$executeRawUnsafe(
      'CREATE TRIGGER spoh_test_fail_restore_receipt BEFORE UPDATE ON "IdempotencyRecord" FOR EACH ROW EXECUTE FUNCTION spoh_test_fail_restore_receipt()',
    );
    try {
      expect(
        (await post(input(original.id, { expectedVersion: operation === 'reset' ? 2 : 0 }))).status,
      ).toBe(500);
      expect(await effects()).toEqual(before);
    } finally {
      await rawDb.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS spoh_test_fail_restore_receipt ON "IdempotencyRecord"',
      );
      await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS spoh_test_fail_restore_receipt()');
    }
  },
);
it.each(['authority', 'phase', 'station', 'version', 'history', 'clock'] as const)(
  'observes committed %s after waiting on Event before restoring history',
  async (condition) => {
    const selected =
      condition === 'history'
        ? { id: 'late-scoped-history' }
        : await seedHistory(
            condition === 'station' ? { scope: 'STATION', scopeId: f.stationId } : {},
          );
    const body = ScopedSettingsRevertRequest.parse(
      input(
        selected.id,
        condition === 'station' ? { target: { scope: 'station', stationId: f.stationId } } : {},
      ),
    );
    expect(
      await reserve(body.idempotencyKey, {
        endpoint: 'setting.operational.revert',
        actorSub: f.creator.sub,
        eventId: f.eventId,
      }),
    ).toBeNull();
    let pending: ReturnType<typeof revertScopedSetting> | undefined;
    let now = lifecycleNow;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = revertScopedSetting(body, { ...actor(), clock: { now: () => now } });
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(waits[0]!.count);
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
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key: body.key,
            value: 30,
            version: 5,
          },
        });
      else if (condition === 'history')
        await tx.settingChange.create({
          data: {
            id: selected.id,
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key: body.key,
            version: 1,
            before: 15,
            after: 20,
            source: 'USER',
            createdAt: now,
          },
        });
    });
    if (condition === 'history' || condition === 'clock') {
      const response = await pending;
      expect(response?.current.evaluatedAt).toBe(now.toISOString());
      expect(response?.history.version).toBe(2);
    } else {
      await expect(pending).rejects.toMatchObject({
        statusCode: condition === 'authority' ? 403 : condition === 'station' ? 404 : 409,
      });
      expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(1);
      expect(await rawDb.auditLog.count({ where: { eventId: f.eventId } })).toBe(0);
    }
  },
);
it.each(['write', 'replay'] as const)(
  'rechecks exact-member deactivation after its %s lock wait',
  async (kind) => {
    const original = await seedHistory();
    const body = ScopedSettingsRevertRequest.parse(input(original.id));
    const first = kind === 'replay' ? await post(body) : null;
    if (first) expect(first.status).toBe(200);
    else
      expect(
        await reserve(body.idempotencyKey, {
          endpoint: 'setting.operational.revert',
          actorSub: f.creator.sub,
          eventId: f.eventId,
        }),
      ).toBeNull();
    const beforeChanges = await rawDb.settingChange.count({ where: { eventId: f.eventId } });
    let pending: ReturnType<typeof revertScopedSetting> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      pending = first
        ? readScopedRevert(toScopedRevertReceipt(first.body), body, actor())
        : revertScopedSetting(body, actor());
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 403 });
    expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(beforeChanges);
  },
);
it('rebuilds a completed restore from current values and later clock after an Event lock wait', async () => {
  const original = await seedHistory();
  const body = ScopedSettingsRevertRequest.parse(input(original.id));
  const first = await post(body);
  expect(first.status).toBe(200);
  let pending: ReturnType<typeof readScopedRevert> | undefined;
  let now = lifecycleNow;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    pending = readScopedRevert(toScopedRevertReceipt(first.body), body, {
      ...actor(),
      clock: { now: () => now },
    });
    void pending.catch(() => undefined);
    await expect
      .poll(async () => {
        const waits = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
        return Number(waits[0]!.count);
      })
      .toBeGreaterThan(0);
    now = new Date(lifecycleNow.getTime() + 60_000);
    await tx.setting.updateMany({
      where: { eventId: f.eventId, scope: 'EVENT', key: body.key },
      data: { value: 30, version: 4 },
    });
  });
  const response = await pending;
  expect(response?.current.evaluatedAt).toBe(now.toISOString());
  expect(response?.history).toEqual(first.body.history);
  expect(response?.current.data.find(({ key }) => key === body.key)).toMatchObject({
    value: 30,
    storedVersion: 4,
  });
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(2);
});
it('lets concurrent copies of one restore intent retry to one committed change', async () => {
  const original = await seedHistory();
  const body = input(original.id);
  const responses = await Promise.all([post(body), post(body)]);
  expect(responses.some(({ status }) => status === 200)).toBe(true);
  expect(responses.every(({ status }) => [200, 409].includes(status))).toBe(true);
  expect((await post(body)).status).toBe(200);
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(2);
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId } })).toBe(1);
  expect(await rawDb.idempotencyRecord.count({ where: { eventId: f.eventId } })).toBe(1);
});

it.each(['SCHEDULE', 'CLONE', 'REVERT', 'MIGRATION'] as const)(
  'restores registered %s history without adopting its original actor',
  async (source) => {
    const original = await seedHistory({ source, actorPersonId: null });
    const response = await post(input(original.id));
    expect(response.status).toBe(200);
    expect(ScopedSettingsRevertResponse.parse(response.body).history).toMatchObject({
      source: 'REVERT',
      createdByYou: true,
    });
    expect(
      (await rawDb.settingChange.findUniqueOrThrow({ where: { id: response.body.history.id } }))
        .actorPersonId,
    ).toBe(f.creator.id);
  },
);
it.each([
  ['implausibleTapsPerMinute', 2.5, 5.5],
  ['vocabulary.missionCard', 'Mission Card', '  Journey card  '],
  ['incident.pushSeverities', ['HIGH'], ['HIGH', 'CRITICAL']],
] as const)(
  'restores the registered %s value with schema normalisation',
  async (key, before, after) => {
    const original = await seedHistory({
      key,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    });
    const response = await post(input(original.id, { key, reason: '  Review historical value  ' }));
    expect(response.status).toBe(200);
    expect(response.body.history.reason).toBe('Review historical value');
    expect(response.body.history.values.after).toEqual(
      typeof after === 'string' ? after.trim() : after,
    );
    expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
      original,
    );
  },
);
it('restores a station override from history while recording the actual inherited event value', async () => {
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'silentStationMinutes',
      value: 25,
      version: 7,
    },
  });
  const original = await seedHistory({ scope: 'STATION', scopeId: f.stationId, version: 3 });
  const response = await post(
    input(original.id, { target: { scope: 'station', stationId: f.stationId } }),
  );
  expect(response.status).toBe(200);
  expect(response.body.history).toMatchObject({
    version: 4,
    values: { available: true, operation: 'set', before: 25, after: 20 },
  });
  expect(
    await rawDb.setting.findFirstOrThrow({
      where: { eventId: f.eventId, scope: 'EVENT', key: original.key },
    }),
  ).toMatchObject({ value: 25, version: 7 });
});
it('restores a historical reset by removing the override and recording selected history provenance', async () => {
  const original = await seedHistory({ source: 'RESET', before: 20, after: dbNull, version: 2 });
  await rawDb.setting.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: original.key,
      value: 30,
      version: 3,
    },
  });
  const response = await post(input(original.id, { expectedVersion: 3 }));
  expect(response.status).toBe(200);
  expect(response.body.history).toMatchObject({
    version: 4,
    source: 'RESET',
    values: { available: true, operation: 'reset', before: 30 },
  });
  expect(response.body.history.values).not.toHaveProperty('after');
  expect(response.body.revertedFrom).toEqual({
    historyId: original.id,
    version: 2,
    operation: 'reset',
  });
  expect(
    response.body.current.data.find(({ key }: { key: string }) => key === original.key),
  ).toMatchObject({ value: 15, storedVersion: 0 });
  expect(
    await rawDb.auditLog.findFirstOrThrow({
      where: { eventId: f.eventId, action: 'setting.change' },
    }),
  ).toMatchObject({
    after: { reset: true, source: 'RESET', revertedFrom: { historyId: original.id, version: 2 } },
  });
  expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
    original,
  );
});
it('refuses removing already inherited or stale overrides through reset history without effects', async () => {
  const original = await seedHistory({ source: 'RESET', after: dbNull });
  const before = await effects();
  for (const expectedVersion of [0, 4]) {
    const response = await post(input(original.id, { expectedVersion }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.SETTING_VERSION_CONFLICT);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(await effects()).toEqual(before);
});
it('replays only identifiers and rebuilds current values after a later edit or reset', async () => {
  const original = await seedHistory();
  const body = input(original.id);
  const first = await post(body);
  expect(first.status).toBe(200);
  const stored = await rawDb.idempotencyRecord.findUniqueOrThrow({
    where: { key: body.idempotencyKey },
  });
  expect(stored.responseBody).toEqual({
    historyId: first.body.history.id,
    targetHistoryId: original.id,
    key: body.key,
    target: body.target,
    expectedVersion: 0,
  });
  expect(JSON.stringify(stored.responseBody)).not.toContain(body.reason);
  await rawDb.setting.updateMany({
    where: { eventId: f.eventId, scope: 'EVENT', key: original.key },
    data: { value: 30, version: 3 },
  });
  const later = await post(body);
  expect(later.status).toBe(200);
  expect(later.body.history).toEqual(first.body.history);
  expect(
    later.body.current.data.find(({ key }: { key: string }) => key === original.key),
  ).toMatchObject({ value: 30, storedVersion: 3 });
  await rawDb.setting.deleteMany({
    where: { eventId: f.eventId, scope: 'EVENT', key: original.key },
  });
  const reset = await post(body);
  expect(reset.status).toBe(200);
  expect(reset.body.history).toEqual(first.body.history);
  expect(
    reset.body.current.data.find(({ key }: { key: string }) => key === original.key),
  ).toMatchObject({ value: 15, storedVersion: 0 });
  expect(await rawDb.settingChange.count({ where: { eventId: f.eventId } })).toBe(2);
  expect(await rawDb.auditLog.count({ where: { eventId: f.eventId } })).toBe(1);
});

it('restores owned event history as a new reviewed override with attributed provenance', async () => {
  const original = await rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: 'silentStationMinutes',
      version: 1,
      before: 15,
      after: 20,
      source: 'USER',
      actorPersonId: f.creator.id,
      createdAt: lifecycleNow,
    },
  });
  const response = await post(input(original.id));
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({
    history: {
      key: 'silentStationMinutes',
      version: 2,
      source: 'REVERT',
      createdByYou: true,
      values: { available: true, operation: 'set', before: 15, after: 20 },
    },
    reviewedVersion: 0,
    revertedFrom: { historyId: original.id, version: 1, operation: 'set' },
    current: { target: { scope: 'event' } },
  });
  expect(
    response.body.current.data.find(({ key }: { key: string }) => key === original.key),
  ).toMatchObject({ value: 20, storedVersion: 2 });
  expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
    original,
  );
  expect(
    await rawDb.auditLog.findFirstOrThrow({
      where: { eventId: f.eventId, action: 'setting.change' },
    }),
  ).toMatchObject({
    actorId: f.creator.id,
    after: { source: 'REVERT', revertedFrom: { historyId: original.id, version: 1 } },
  });
});

it('restores only the exact owned station history and keeps event inheritance untouched', async () => {
  const original = await rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'STATION',
      scopeId: f.stationId,
      key: 'capture.open',
      version: 1,
      before: true,
      after: false,
      source: 'USER',
      actorPersonId: f.creator.id,
      createdAt: lifecycleNow,
    },
  });
  const response = await post(
    input(original.id, {
      target: { scope: 'station', stationId: f.stationId },
      key: 'capture.open',
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.history).toMatchObject({
    source: 'REVERT',
    version: 2,
    values: { available: true, operation: 'set', before: true, after: false },
  });
  expect(response.body.current.target).toEqual({ scope: 'station', stationId: f.stationId });
  expect(
    response.body.current.data.find(({ key }: { key: string }) => key === 'capture.open'),
  ).toMatchObject({ value: false, storedVersion: 2 });
  expect(await rawDb.setting.count({ where: { eventId: f.eventId, scope: 'EVENT' } })).toBe(0);
  expect(await rawDb.settingChange.findUniqueOrThrow({ where: { id: original.id } })).toEqual(
    original,
  );
});
