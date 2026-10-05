import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  ScopedSettingsHistoryQuery,
  ScopedSettingsHistoryResponse,
  SettingChangeSource,
} from '@spoh/shared';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { readScopedHistory } from '../../src/modules/settings/application/readScopedHistory.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
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
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT,
  clock: fixedClock(lifecycleNow),
});
const history = (patch: Partial<Prisma.SettingChangeUncheckedCreateInput> = {}) =>
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
      reason: 'Review threshold',
      createdAt: lifecycleNow,
      ...patch,
    },
  });
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue`;
const get = (query = '?key=silentStationMinutes') =>
  request(app).get(`${endpoint()}/history${query}`).set('Authorization', bearer(f.creator));
const post = (body: object) =>
  request(app).post(endpoint()).set('Authorization', bearer(f.creator)).send(body);
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('returns owned event operational history without actor IDs or raw private fields', async () => {
  const history = await rawDb.settingChange.create({
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
      reason: 'Review the quiet room threshold',
      createdAt: lifecycleNow,
    },
  });
  const before = await rawDb.settingChange.findMany();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({
    eventId: f.eventId,
    target: { scope: 'event' },
    key: 'silentStationMinutes',
    eventStatus: 'DRAFT',
    data: [
      {
        id: history.id,
        version: 1,
        source: 'USER',
        createdByYou: true,
        values: { available: true, operation: 'set', before: 15, after: 20 },
      },
    ],
    meta: { count: 1, nextCursor: null },
  });
  for (const field of [
    f.creator.id,
    'actorPersonId',
    'scopeId',
    'organisationId',
    'scheduledActionId',
  ])
    expect(response.text).not.toContain(field);
  expect(await rawDb.settingChange.findMany()).toEqual(before);
  expect(await rawDb.setting.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
});

it('describes an actual station reset as removed override without inventing its historical after value', async () => {
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
  const changed = await post({
    target: { scope: 'station', stationId: f.stationId },
    operation: 'set',
    key: 'silentStationMinutes',
    value: 20,
    expectedVersion: 0,
    reason: 'Synthetic station threshold review',
    idempotencyKey: randomUUID(),
  });
  expect(changed.status).toBe(200);
  const reset = await post({
    target: { scope: 'station', stationId: f.stationId },
    operation: 'reset',
    key: 'silentStationMinutes',
    expectedVersion: changed.body.change.version,
    reason: 'Return to event inheritance',
    idempotencyKey: randomUUID(),
  });
  expect(reset.status).toBe(200);
  const response = await get(`?scope=station&stationId=${f.stationId}&key=silentStationMinutes`);
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject([
    { source: 'RESET', values: { available: true, operation: 'reset', before: 20 } },
    { source: 'USER', values: { available: true, operation: 'set', before: 25, after: 20 } },
  ]);
  expect(response.body.data[0].values).not.toHaveProperty('after');
});

it('returns an empty strict collection for an unchanged supported key without effects', async () => {
  const before = await f.state();
  const response = await get('?key=capture.open');
  expect(response.status).toBe(200);
  expect(ScopedSettingsHistoryResponse.parse(response.body)).toMatchObject({
    target: { scope: 'event' },
    key: 'capture.open',
    data: [],
    meta: { count: 0, nextCursor: null },
  });
  expect(await f.state()).toEqual(before);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
  expect(await rawDb.scheduledAction.count()).toBe(0);
});
it.each(SettingChangeSource.options)(
  'returns bounded %s metadata with the correct historical operation',
  async (source) => {
    await history({ source });
    const response = await get();
    expect(response.status).toBe(200);
    expect(ScopedSettingsHistoryResponse.parse(response.body).data[0]).toMatchObject({
      source,
      values:
        source === 'RESET'
          ? { available: true, operation: 'reset', before: 15 }
          : { available: true, operation: 'set', before: 15, after: 20 },
    });
    if (source === 'RESET') expect(response.body.data[0].values).not.toHaveProperty('after');
  },
);
it.each([
  { key: 'capture.open', before: true, after: false, expected: false },
  { key: 'implausibleTapsPerMinute', before: 2.5, after: 5.5, expected: 5.5 },
  {
    key: 'vocabulary.missionCard',
    before: ' Mission Card ',
    after: ' Journey card ',
    expected: 'Journey card',
  },
  {
    key: 'incident.pushSeverities',
    before: ['HIGH'],
    after: ['HIGH', 'CRITICAL'],
    expected: ['HIGH', 'CRITICAL'],
  },
])(
  'validates historical values for $key without changing their stored representation',
  async ({ key, before, after, expected }) => {
    const stored = await history({ key, before, after });
    const response = await get(`?key=${key}`);
    expect(response.status).toBe(200);
    expect(ScopedSettingsHistoryResponse.parse(response.body).data[0]?.values).toMatchObject({
      available: true,
      operation: 'set',
      after: expected,
    });
    expect(await rawDb.settingChange.findUnique({ where: { id: stored.id } })).toEqual(stored);
  },
);
it('omits malformed legacy values while preserving history and valid bounded metadata', async () => {
  const invalidBefore = await history({
    before: { privateMarker: 'unregistered-private-history' },
  });
  const invalidAfter = await history({ after: { privateMarker: 'unregistered-private-history' } });
  const reset = await history({
    source: 'RESET',
    before: { privateMarker: 'unregistered-private-history' },
    after: { privateMarker: 'unregistered-private-history' },
  });
  const outOfBounds = await history({ after: 0, reason: 'x'.repeat(700), actorPersonId: null });
  const before = await rawDb.settingChange.findMany();
  const response = await get();
  expect(response.status).toBe(200);
  const parsed = ScopedSettingsHistoryResponse.parse(response.body);
  expect(parsed.data.find(({ id }) => id === invalidBefore.id)?.values).toEqual({
    available: true,
    operation: 'set',
    before: null,
    after: 20,
  });
  expect(parsed.data.find(({ id }) => id === invalidAfter.id)?.values).toEqual({
    available: false,
  });
  expect(parsed.data.find(({ id }) => id === reset.id)?.values).toEqual({
    available: true,
    operation: 'reset',
    before: null,
  });
  expect(parsed.data.find(({ id }) => id === outOfBounds.id)).toMatchObject({
    createdByYou: false,
    reason: 'x'.repeat(500),
    values: { available: false },
  });
  expect(response.text).not.toContain('unregistered-private-history');
  expect(await rawDb.settingChange.findMany()).toEqual(before);
});
it('reports other/null authors as a boolean without disclosing their identities', async () => {
  const other = await createVolunteer({
    email: 'scoped-history-author@synthetic.test',
    role: 'VOLUNTEER',
  });
  await history({ actorPersonId: other.id, reason: null });
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.body.data[0]).toMatchObject({ createdByYou: false, reason: null });
  expect(response.text).not.toContain(other.id);
  expect(response.text).not.toContain(other.email);
});
it('paginates equal timestamps without repeats or omissions when a newer row is appended', async () => {
  for (const version of [1, 2, 3, 4]) await history({ id: `history-tie-${version}`, version });
  const first = await get('?key=silentStationMinutes&limit=2');
  expect(first.status).toBe(200);
  expect(first.body.data.map((row: { id: string }) => row.id)).toEqual([
    'history-tie-4',
    'history-tie-3',
  ]);
  expect(first.body.meta).toEqual({ count: 2, nextCursor: 'history-tie-3' });
  await history({
    id: 'history-newer',
    version: 5,
    createdAt: new Date(lifecycleNow.getTime() + 1),
  });
  const next = await get(`?key=silentStationMinutes&limit=2&cursor=${first.body.meta.nextCursor}`);
  expect(next.status).toBe(200);
  expect(ScopedSettingsHistoryResponse.parse(next.body).data.map(({ id }) => id)).toEqual([
    'history-tie-2',
    'history-tie-1',
  ]);
  expect(next.body.meta).toEqual({ count: 2, nextCursor: null });
});

it.each(['event', 'station'] as const)(
  'isolates exact %s history and rejects foreign event/key/scope cursors',
  async (scope) => {
    const other = await testEvent();
    const org = await rawDb.organisation.upsert({
      where: { slug: 'foreign-scoped-history-org' },
      create: {
        slug: 'foreign-scoped-history-org',
        name: 'Other history organisation',
        appName: 'Other',
        defaultTimezone: 'Asia/Singapore',
      },
      update: {},
    });
    const foreignEvent = await createEvent({
      organisationId: org.id,
      slug: 'foreign-scoped-history-event',
      name: 'Other history event',
      timezone: 'Asia/Singapore',
      categories: [],
      stationTypes: [],
      shiftTemplates: [],
    });
    const selectedScope = scope === 'event' ? 'EVENT' : 'STATION';
    const scopeId = scope === 'event' ? f.eventId : f.stationId;
    const own = await history({ scope: selectedScope, scopeId });
    const rows = [
      await history({ eventId: other.eventId, scope: selectedScope, scopeId }),
      await history({ eventId: foreignEvent.id, scope: selectedScope, scopeId: foreignEvent.id }),
      await history({ scope: selectedScope, scopeId: 'wrong-history-scope' }),
      await history({ scope: 'PLATFORM', scopeId: f.organisationId, eventId: null }),
      await history({ scope: 'PLATFORM', scopeId: f.organisationId }),
      await history({ scope: scope === 'event' ? 'STATION' : 'EVENT', scopeId }),
      await history({
        scope: selectedScope,
        scopeId,
        key: 'capture.open',
        before: true,
        after: false,
      }),
    ];
    const query = `?key=silentStationMinutes&scope=${scope}${scope === 'station' ? `&stationId=${f.stationId}` : ''}`;
    const response = await get(query);
    expect(response.status).toBe(200);
    expect(ScopedSettingsHistoryResponse.parse(response.body).data.map(({ id }) => id)).toEqual([
      own.id,
    ]);
    for (const row of rows) {
      expect(response.text).not.toContain(row.id);
      const denied = await get(`${query}&cursor=${row.id}`);
      expect(denied.status).toBe(404);
      expect(denied.headers['cache-control']).toBe('no-store');
      expect(denied.body.data).toBeUndefined();
    }
  },
);
it('rejects missing/foreign stations and same-event other-station cursors', async () => {
  const foreign = await createStation({ code: 'OTHER-HISTORY' });
  for (const stationId of ['missing-history-station', foreign.id]) {
    const denied = await get(`?key=silentStationMinutes&scope=station&stationId=${stationId}`);
    expect(denied.status).toBe(404);
    expect(denied.headers['cache-control']).toBe('no-store');
  }
  const ownStation = await rawDb.station.findUniqueOrThrow({
    where: { id: f.stationId },
    select: { typeId: true },
  });
  const other = await rawDb.station.create({
    data: {
      eventId: f.eventId,
      typeId: ownStation.typeId,
      code: 'SECOND-HISTORY',
      name: 'Other owned station',
    },
  });
  const otherHistory = await history({ scope: 'STATION', scopeId: other.id });
  const denied = await get(
    `?key=silentStationMinutes&scope=station&stationId=${f.stationId}&cursor=${otherHistory.id}`,
  );
  expect(denied.status).toBe(404);
  expect(denied.headers['cache-control']).toBe('no-store');
});
it('rejects a missing cursor without exposing a collection', async () => {
  const denied = await get('?key=silentStationMinutes&cursor=missing-history');
  expect(denied.status).toBe(404);
  expect(denied.headers['cache-control']).toBe('no-store');
  expect(denied.body.data).toBeUndefined();
});

it('rejects malformed queries and guarded selections with no-store and no effects', async () => {
  for (const query of [
    '?',
    '?key=product.countsMode',
    '?key=product.visitorDataMode',
    '?key=attendance.campusCidrs',
    '?key=lostPersonPurgeHours',
    '?key=auth.accessTokenTtlSeconds',
    '?key=eventName',
    '?key=capture.open&scope=platform',
    '?key=capture.open&scope=station',
    '?key=capture.open&stationId=unexpected',
    `?key=longShiftMinutes&scope=station&stationId=${f.stationId}`,
    '?key=capture.open&limit=0',
    '?key=capture.open&limit=201',
    '?key=capture.open&limit=1.5',
    '?key=capture.open&cursor=',
    '?key=capture.open&eventId=foreign',
    '?key=capture.open&source=USER',
  ]) {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toBeUndefined();
  }
  expect(await rawDb.settingChange.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
});
it('rejects anonymous and active non-manager reads without disclosing history', async () => {
  await history();
  const person = await createVolunteer({
    email: 'scoped-history-reader@test.invalid',
    role: 'VOLUNTEER',
  });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  const anonymous = await request(app).get(`${endpoint()}/history?key=silentStationMinutes`);
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const denied = await request(app)
    .get(`${endpoint()}/history?key=silentStationMinutes`)
    .set('Authorization', bearer(person));
  expect(denied.status).toBe(403);
  expect(denied.headers['cache-control']).toBe('no-store');
  expect(denied.body.data).toBeUndefined();
});
it.each([
  { role: 'VOLUNTEER' as const },
  { status: 'DEACTIVATED' as const },
  { status: 'INVITED' as const },
  { status: 'ENDED' as const },
])('rechecks stale manager context against current membership: %j', async (data) => {
  await history();
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data });
  await expect(
    readScopedHistory(ScopedSettingsHistoryQuery.parse({ key: 'silentStationMinutes' }), actor()),
  ).rejects.toMatchObject({ statusCode: 403 });
});
it('rejects mismatched membership/person/event authority', async () => {
  const query = ScopedSettingsHistoryQuery.parse({ key: 'silentStationMinutes' });
  for (const patch of [
    { volunteerId: 'wrong-person' },
    { membershipId: 'wrong-membership' },
    { scope: await testEvent() },
  ])
    await expect(readScopedHistory(query, { ...actor(), ...patch })).rejects.toMatchObject({
      statusCode: 403,
    });
  await expect(
    readScopedHistory(query, { ...actor(), scope: { eventId: 'missing-event' } }),
  ).rejects.toMatchObject({ statusCode: 404 });
});
it.each(['DRAFT', 'READY', 'REHEARSAL', 'LIVE', 'CLOSED', 'ARCHIVED'] as const)(
  'permits a current manager to inspect %s history without changing event state',
  async (status) => {
    await history();
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const before = await f.state();
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.eventStatus).toBe(status);
    expect(await f.state()).toEqual(before);
  },
);

it.each(['rows', 'authority', 'station', 'cursor', 'phase'] as const)(
  'observes committed %s after the Event lock wait and evaluates the later clock',
  async (change) => {
    let now = lifecycleNow;
    let reading: ReturnType<typeof readScopedHistory> | undefined;
    if (change === 'cursor')
      await history({
        id: 'history-before-cursor',
        createdAt: new Date(lifecycleNow.getTime() - 1),
      });
    const query = ScopedSettingsHistoryQuery.parse({
      key: 'silentStationMinutes',
      ...(change === 'station' ? { scope: 'station', stationId: f.stationId } : {}),
      ...(change === 'cursor' ? { cursor: 'history-late-cursor' } : {}),
    });
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      reading = readScopedHistory(query, { ...actor(), clock: { now: () => now } });
      void reading.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
          AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      now = new Date(lifecycleNow.getTime() + 60_000);
      if (change === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else if (change === 'station') await tx.station.delete({ where: { id: f.stationId } });
      else if (change === 'phase')
        await tx.event.update({ where: { id: f.eventId }, data: { status: 'CLOSED' } });
      else
        await tx.settingChange.create({
          data: {
            ...(change === 'cursor' ? { id: 'history-late-cursor' } : {}),
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key: 'silentStationMinutes',
            version: 2,
            before: 15,
            after: 22,
            source: 'USER',
            actorPersonId: f.creator.id,
            createdAt: now,
          },
        });
    });
    if (change === 'authority') await expect(reading).rejects.toMatchObject({ statusCode: 403 });
    else if (change === 'station') await expect(reading).rejects.toMatchObject({ statusCode: 404 });
    else {
      const result = await reading;
      expect(result?.evaluatedAt).toBe(now.toISOString());
      if (change === 'phase') expect(result?.eventStatus).toBe('CLOSED');
      else if (change === 'cursor')
        expect(result?.data.map(({ id }) => id)).toEqual(['history-before-cursor']);
      else
        expect(result?.data[0]?.values).toMatchObject({
          available: true,
          operation: 'set',
          after: 22,
        });
    }
  },
);
it('rechecks the exact membership after waiting on its concurrent revocation', async () => {
  await history();
  let reading: ReturnType<typeof readScopedHistory> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    reading = readScopedHistory(
      ScopedSettingsHistoryQuery.parse({ key: 'silentStationMinutes' }),
      actor(),
    );
    void reading.catch(() => undefined);
    await expect
      .poll(async () => {
        const waits = await rawDb.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
        return Number(waits[0]!.count);
      })
      .toBeGreaterThan(0);
    await tx.eventMembership.update({
      where: { id: f.membershipId },
      data: { status: 'DEACTIVATED' },
    });
  });
  await expect(reading).rejects.toMatchObject({ statusCode: 403 });
});
