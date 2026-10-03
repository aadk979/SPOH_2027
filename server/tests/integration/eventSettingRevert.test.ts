import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  RevertEventSettingRequest,
  RevertEventSettingResponse,
  type EventSettingKey,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { changeEventSetting } from '../../src/modules/settings/application/changeEventSetting.js';
import { readProductRevert } from '../../src/modules/settings/application/readProductRevert.js';
import { revertEventSetting } from '../../src/modules/settings/application/revertEventSetting.js';
import { toRevertReceipt } from '../../src/modules/settings/domain/revertReceipt.js';
import { dbNull } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { invalidateRateLimitPolicy } from '../../src/platform/http/rateLimitPolicy.js';
import { reserve } from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, testEvent } from '../helpers/fixtures.js';
import {
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const counts: EventSettingKey = 'product.countsMode';
const visitor: EventSettingKey = 'product.visitorDataMode';
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT,
});
const endpoint = () => `/api/v1/events/${f.eventId}/admin/event-settings`;
const change = (key: EventSettingKey, value: unknown, version: number) =>
  request(app)
    .patch(endpoint())
    .set('Authorization', bearer(f.creator))
    .send({ key, value, expectedVersion: version });
const history = (key: EventSettingKey = counts) =>
  rawDb.settingChange.findMany({
    where: { eventId: f.eventId, scope: 'EVENT', scopeId: f.eventId, key },
    orderBy: { version: 'asc' },
  });
const post = (body: object) =>
  request(app).post(`${endpoint()}/revert`).set('Authorization', bearer(f.creator)).send(body);
const input = (historyId: string, key: EventSettingKey = counts, expectedVersion = 2) => ({
  key,
  historyId,
  expectedVersion,
  reason: 'Restore reviewed synthetic history',
  idempotencyKey: randomUUID(),
});
async function countHistory() {
  expect(
    (await change(counts, { mode: 'headline', source: { count: 'registrations' } }, 0)).status,
  ).toBe(200);
  expect((await change(counts, { mode: 'separate' }, 1)).status).toBe(200);
  return (await history())[0]!;
}
async function privacyHistory() {
  expect((await change(visitor, 'allowlist', 0)).status).toBe(200);
  expect((await change(visitor, 'none', 1)).status).toBe(200);
  expect((await change(visitor, 'allowlist', 2)).status).toBe(200);
  return (await history(visitor))[1]!;
}
async function privateRecord() {
  const registration = await rawDb.registration.create({
    data: {
      eventId: f.eventId,
      rehearsal: false,
      categoryId: f.categoryId,
      stationId: f.stationId,
      recordedById: f.creator.id,
      recordedByMembershipId: f.membershipId,
      idempotencyKey: randomUUID(),
    },
  });
  return rawDb.visitorRecord.create({
    data: {
      eventId: f.eventId,
      rehearsal: false,
      registrationId: registration.id,
      data: { contact: 'synthetic-private-value' },
    },
  });
}
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  // The frozen clock keeps this file's synthetic requests in one admin window.
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
  invalidateRateLimitPolicy();
});

it('restores a reviewed historical value as a new attributed version with append-only history and metadata audit', async () => {
  const target = await countHistory();
  const before = await history();
  const response = await post(input(target.id));
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(RevertEventSettingResponse.parse(response.body)).toMatchObject({
    reviewedVersion: 2,
    revertedFrom: { historyId: target.id, version: 1 },
    history: { version: 3, source: 'REVERT', createdByYou: true },
    current: { settings: { [counts]: target.after }, versions: { [counts]: 3 } },
  });
  expect((await history()).slice(0, 2)).toEqual(before);
  const audit = await rawDb.auditLog.findFirst({
    where: {
      eventId: f.eventId,
      action: 'setting.change',
      after: { path: ['source'], equals: 'REVERT' },
    },
  });
  expect(audit).toMatchObject({
    actorId: f.creator.id,
    membershipId: f.membershipId,
    after: { version: 3, source: 'REVERT', revertedFrom: { historyId: target.id, version: 1 } },
  });
});
it('replays one successful revert from an id-only receipt and rebuilds current settings after a later change', async () => {
  const target = await countHistory();
  const body = input(target.id);
  const first = await post(body);
  expect(first.status).toBe(200);
  const stored = await rawDb.idempotencyRecord.findUniqueOrThrow({
    where: { key: body.idempotencyKey },
  });
  expect(stored.responseBody).toEqual(toRevertReceipt(first.body));
  expect(JSON.stringify(stored.responseBody)).not.toContain('Restore reviewed');
  expect(JSON.stringify(stored.responseBody)).not.toContain('headline');
  expect((await change(counts, { mode: 'separate' }, 3)).status).toBe(200);
  const replay = await post(body);
  expect(replay.status).toBe(200);
  expect(replay.headers['cache-control']).toBe('no-store');
  expect(replay.body.history.id).toBe(first.body.history.id);
  expect(replay.body.current.versions[counts]).toBe(4);
  expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(1);
});
it.each(['historyId', 'key', 'expectedVersion'])(
  'rejects reuse of a completed key with a different %s intent',
  async (field) => {
    const target = await countHistory();
    const body = input(target.id);
    expect((await post(body)).status).toBe(200);
    const modified = {
      ...body,
      [field]: field === 'expectedVersion' ? 3 : field === 'key' ? visitor : 'different-history',
    };
    const response = await post(modified);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(1);
  },
);
it('rejects stale reviewed versions without changing settings/history/audit or retaining a failed receipt', async () => {
  const target = await countHistory();
  const body = input(target.id, counts, 1);
  const before = await history();
  const audits = await rawDb.auditLog.count();
  const response = await post(body);
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe('SETTING_VERSION_CONFLICT');
  expect(await history()).toEqual(before);
  expect(await rawDb.auditLog.count()).toBe(audits);
  expect(
    await rawDb.idempotencyRecord.findUnique({ where: { key: body.idempotencyKey } }),
  ).toBeNull();
});
it('admits only one of two concurrent reverts reviewed at the same version', async () => {
  const target = await countHistory();
  const responses = await Promise.all([post(input(target.id)), post(input(target.id))]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(1);
});
it('purges visitor records when restoring none without touching their registrations or copying personal data into receipt/audit', async () => {
  const target = await privacyHistory();
  await privateRecord();
  const registrations = await rawDb.registration.findMany({ where: { eventId: f.eventId } });
  const body = input(target.id, visitor, 3);
  const response = await post(body);
  expect(response.status).toBe(200);
  expect(response.body.current.settings[visitor]).toBe('none');
  expect(response.body.current.versions[visitor]).toBe(4);
  expect(await rawDb.visitorRecord.count({ where: { eventId: f.eventId } })).toBe(0);
  expect(await rawDb.registration.findMany({ where: { eventId: f.eventId } })).toEqual(
    registrations,
  );
  const audits = await rawDb.auditLog.findMany({ where: { eventId: f.eventId } });
  expect(JSON.stringify(audits)).not.toContain('synthetic-private-value');
  expect(
    JSON.stringify(
      (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: body.idempotencyKey } }))
        .responseBody,
    ),
  ).not.toContain('synthetic-private-value');
  expect(audits.some((row) => JSON.stringify(row.after).includes('"visitorRecordsPurged":1'))).toBe(
    true,
  );
});
it('rolls back the setting, history, audit, purge and receipt when the metadata audit cannot commit', async () => {
  const target = await privacyHistory();
  const record = await privateRecord();
  const before = await history(visitor);
  const audits = await rawDb.auditLog.count();
  const body = input(target.id, visitor, 3);
  await rawDb.$executeRawUnsafe(
    `CREATE FUNCTION spoh_test_fail_product_revert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'setting.change' AND NEW."after"->>'source' = 'REVERT' THEN RAISE EXCEPTION 'synthetic revert rollback'; END IF; RETURN NEW; END $$`,
  );
  await rawDb.$executeRawUnsafe(
    'CREATE TRIGGER spoh_test_fail_product_revert BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION spoh_test_fail_product_revert()',
  );
  try {
    expect((await post(body)).status).toBe(500);
    expect(await history(visitor)).toEqual(before);
    expect(await rawDb.auditLog.count()).toBe(audits);
    expect(await rawDb.visitorRecord.findUnique({ where: { id: record.id } })).toEqual(record);
    expect(
      (await rawDb.setting.findFirstOrThrow({ where: { eventId: f.eventId, key: visitor } })).value,
    ).toBe('allowlist');
    expect(
      await rawDb.idempotencyRecord.findUnique({ where: { key: body.idempotencyKey } }),
    ).toBeNull();
  } finally {
    await rawDb.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS spoh_test_fail_product_revert ON "AuditLog"',
    );
    await rawDb.$executeRawUnsafe('DROP FUNCTION IF EXISTS spoh_test_fail_product_revert()');
  }
});
it.each(['LIVE', 'CLOSED', 'ARCHIVED'] as const)(
  'refuses restoring collection during %s',
  async (status) => {
    const target = await privacyHistory();
    expect((await change(visitor, 'none', 3)).status).toBe(200);
    const before = await history(visitor);
    const on = before[0]!;
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const response = await post(input(on.id, visitor, 4));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SETTING_LOCKED');
    expect(await history(visitor)).toEqual(before);
    expect(target.source).toBe('USER');
  },
);
it.each(['missing station', 'non-counting station', 'foreign station'])(
  'rechecks the historical headline against its current %s',
  async (condition) => {
    expect(
      (
        await change(
          counts,
          { mode: 'headline', source: { count: 'footfall', stationId: f.stationId } },
          0,
        )
      ).status,
    ).toBe(200);
    const target = (await history())[0]!;
    expect((await change(counts, { mode: 'separate' }, 1)).status).toBe(200);
    if (condition === 'missing station') await rawDb.station.delete({ where: { id: f.stationId } });
    if (condition === 'non-counting station') {
      const station = await rawDb.station.findUniqueOrThrow({ where: { id: f.stationId } });
      await rawDb.stationType.update({
        where: { id: station.typeId },
        data: { countsEntry: false },
      });
    }
    if (condition === 'foreign station') {
      const foreign = await createStation({ code: 'FOREIGN' });
      await rawDb.settingChange.update({
        where: { id: target.id },
        data: { after: { mode: 'headline', source: { count: 'footfall', stationId: foreign.id } } },
      });
    }
    const response = await post(input(target.id));
    expect(response.status).toBe(condition === 'non-counting station' ? 422 : 404);
    expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(0);
  },
);
it('rejects unsupported historical count values without forwarding private JSON', async () => {
  const target = await countHistory();
  await rawDb.settingChange.update({
    where: { id: target.id },
    data: { after: { mode: 'sum', private: 'synthetic-private-value' } },
  });
  const response = await post(input(target.id));
  expect(response.status).toBe(400);
  expect(response.text).not.toContain('synthetic-private-value');
  expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(0);
});
it('rejects foreign-event, other-key, station and missing historical targets', async () => {
  const target = await countHistory();
  const other = await testEvent();
  const foreign = await rawDb.settingChange.create({
    data: {
      eventId: other.eventId,
      scope: 'EVENT',
      scopeId: other.eventId,
      key: counts,
      version: 1,
      before: { mode: 'separate' },
      after: { mode: 'separate' },
      source: 'USER',
    },
  });
  const station = await rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'STATION',
      scopeId: f.stationId,
      key: counts,
      version: 1,
      after: { mode: 'separate' },
      source: 'USER',
    },
  });
  for (const body of [
    input(foreign.id),
    input(target.id, visitor, 0),
    input(station.id),
    input('missing-history'),
  ])
    expect((await post(body)).status).toBe(404);
});
it('keeps versions monotonic when restoring a legacy RESET after its override was removed', async () => {
  const target = await rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: counts,
      version: 7,
      before: { mode: 'headline', source: { count: 'registrations' } },
      after: dbNull,
      source: 'RESET',
    },
  });
  const response = await post(input(target.id, counts, 0));
  expect(response.status).toBe(200);
  expect(response.body.history.version).toBe(8);
  expect(response.body.current.settings[counts]).toEqual({ mode: 'separate' });
});
it('ordinary writes also retain monotonic history and exclude malformed mixed-event overrides', async () => {
  const other = await testEvent();
  await rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key: counts,
      version: 7,
      source: 'RESET',
      after: dbNull,
    },
  });
  expect((await change(counts, { mode: 'separate' }, 0)).body.versions[counts]).toBe(8);
  await rawDb.setting.updateMany({
    where: { eventId: f.eventId, key: counts },
    data: { eventId: other.eventId },
  });
  const response = await post(input((await history())[0]!.id, counts, 0));
  expect(response.status).toBe(409);
  expect(
    (await rawDb.setting.findFirstOrThrow({ where: { scopeId: f.eventId, key: counts } })).eventId,
  ).toBe(other.eventId);
});
it('rechecks current authority for ordinary writes, new reverts and completed replays', async () => {
  const target = await countHistory();
  const body = input(target.id);
  const first = await post(body);
  expect(first.status).toBe(200);
  await rawDb.eventMembership.update({
    where: { id: f.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  await expect(
    changeEventSetting({ key: counts, value: { mode: 'separate' }, expectedVersion: 3 }, actor()),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(readProductRevert(toRevertReceipt(first.body), actor())).rejects.toMatchObject({
    statusCode: 403,
  });
  expect((await post(input(target.id, counts, 3))).status).toBe(403);
  expect((await post(body)).status).toBe(403);
  expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(1);
});
it.each(['authority', 'phase'])(
  'rechecks committed %s after waiting for the Event lock',
  async (condition) => {
    const target = await countHistory();
    const body = RevertEventSettingRequest.parse(input(target.id));
    // Reserve before holding Event; an HTTP reservation's FK lock would otherwise
    // wait before reaching the application transaction being checked here.
    expect(
      await reserve(body.idempotencyKey, {
        endpoint: 'setting.product.revert',
        actorSub: f.creator.sub,
        eventId: f.eventId,
      }),
    ).toBeNull();
    let pending: ReturnType<typeof revertEventSetting> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      pending = revertEventSetting(body, actor());
      void pending.catch(() => undefined);
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      if (condition === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else await tx.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
    });
    await expect(pending).rejects.toMatchObject({
      statusCode: condition === 'authority' ? 403 : 409,
    });
    expect((await history()).filter((row) => row.source === 'REVERT')).toHaveLength(0);
  },
);
it('rejects anonymous/non-manager callers and generic/forged body fields', async () => {
  const target = await countHistory();
  const person = await createVolunteer({ email: 'revert-reader@test.invalid', role: 'VOLUNTEER' });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  expect((await request(app).post(`${endpoint()}/revert`).send(input(target.id))).status).toBe(401);
  expect(
    (
      await request(app)
        .post(`${endpoint()}/revert`)
        .set('Authorization', bearer(person))
        .send(input(target.id))
    ).status,
  ).toBe(403);
  for (const patch of [
    { value: 'allowlist' },
    { source: 'USER' },
    { actorPersonId: 'someone' },
    { key: 'capture.open' },
    { expectedVersion: -1 },
    { reason: '' },
  ])
    expect((await post({ ...input(target.id), ...patch })).status).toBe(400);
});
