import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  ScopedSettingsReadResponse,
  type ScopedSettingsReadResponse as ReadResponse,
} from '@spoh/shared';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createApp } from '../../src/app/createApp.js';
import { readScopedSettings } from '../../src/modules/settings/application/readScopedSettings.js';
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
const endpoint = () => `/api/v1/events/${f.eventId}/admin/settings/catalogue`;
const get = (query = '') =>
  request(app).get(`${endpoint()}${query}`).set('Authorization', bearer(f.creator));
const stationQuery = () => `?scope=station&stationId=${f.stationId}`;
const row = (response: { body: ReadResponse }, key = 'silentStationMinutes') =>
  response.body.data.find((entry) => entry.key === key);
const store = (input: Partial<Prisma.SettingUncheckedCreateInput> = {}) =>
  rawDb.setting.create({
    data: {
      scope: 'EVENT',
      scopeId: f.eventId,
      eventId: f.eventId,
      key: 'silentStationMinutes',
      value: 20,
      version: 2,
      updatedByPersonId: f.creator.id,
      ...input,
    },
  });
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('returns complete default event values, strict metadata and no side effects', async () => {
  const before = await rawDb.appSetting.findMany();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const parsed = ScopedSettingsReadResponse.parse(response.body);
  expect(parsed).toMatchObject({
    eventId: f.eventId,
    target: { scope: 'event' },
    eventStatus: 'DRAFT',
  });
  expect(parsed.data).toHaveLength(14);
  expect(
    parsed.data.every(
      (entry) =>
        entry.source.scope === 'default' &&
        entry.source.version === 0 &&
        entry.storedVersion === 0 &&
        entry.invalidScopes.length === 0,
    ),
  ).toBe(true);
  for (const privateField of [
    f.creator.id,
    'updatedByPersonId',
    'organisationId',
    'scopeId',
    'reason',
    'product.countsMode',
    'product.visitorDataMode',
    'attendance.campusCidrs',
    'auth.accessTokenTtlSeconds',
  ])
    expect(response.text).not.toContain(privateField);
  expect(await rawDb.appSetting.findMany()).toEqual(before);
  for (const count of [
    await rawDb.setting.count(),
    await rawDb.settingChange.count(),
    await rawDb.auditLog.count(),
    await rawDb.idempotencyRecord.count(),
    await rawDb.scheduledAction.count(),
    await rawDb.visitorRecord.count(),
  ])
    expect(count).toBe(0);
});
it('returns only the three station-capable keys for an owned station', async () => {
  const response = await get(stationQuery());
  expect(response.status).toBe(200);
  expect(ScopedSettingsReadResponse.parse(response.body).target).toEqual({
    scope: 'station',
    stationId: f.stationId,
  });
  expect(response.body.data.map((entry: { key: string }) => entry.key)).toEqual([
    'capture.open',
    'implausibleTapsPerMinute',
    'silentStationMinutes',
  ]);
});
it('resolves event values over their organisation defaults with selected stored versions', async () => {
  await store({
    scope: 'PLATFORM',
    scopeId: f.organisationId,
    eventId: null,
    value: 25,
    version: 3,
  });
  expect(row(await get())).toMatchObject({
    value: 25,
    source: { scope: 'platform', version: 3 },
    storedVersion: 0,
  });
  await store();
  expect(row(await get())).toMatchObject({
    value: 20,
    source: { scope: 'event', version: 2 },
    storedVersion: 2,
  });
});
it('resolves station over event over platform and does not apply station rows to event reads', async () => {
  await store({
    scope: 'PLATFORM',
    scopeId: f.organisationId,
    eventId: null,
    value: 25,
    version: 3,
  });
  expect(row(await get(stationQuery()))).toMatchObject({
    value: 25,
    source: { scope: 'platform', version: 3 },
    storedVersion: 0,
  });
  await store();
  expect(row(await get(stationQuery()))).toMatchObject({
    value: 20,
    source: { scope: 'event', version: 2 },
    storedVersion: 0,
  });
  await store({ scope: 'STATION', scopeId: f.stationId, value: 5, version: 7 });
  expect(row(await get(stationQuery()))).toMatchObject({
    value: 5,
    source: { scope: 'station', version: 7 },
    storedVersion: 7,
  });
  expect(row(await get())).toMatchObject({
    value: 20,
    source: { scope: 'event', version: 2 },
    storedVersion: 2,
  });
});
it('keeps malformed selected override versions and inherits validated values without leaking JSON', async () => {
  await store();
  const invalid = await store({
    scope: 'STATION',
    scopeId: f.stationId,
    value: { personal: 'private-invalid-value' },
    version: 9,
  });
  const response = await get(stationQuery());
  expect(response.status).toBe(200);
  expect(row(response)).toMatchObject({
    value: 20,
    source: { scope: 'event', version: 2 },
    storedVersion: 9,
    invalidScopes: ['station'],
  });
  expect(response.text).not.toContain('private-invalid-value');
  expect(await rawDb.setting.findUnique({ where: { id: invalid.id } })).toEqual(invalid);
});
it('falls through every malformed permitted layer to the registered default', async () => {
  await store({ value: -5, version: 4 });
  await store({
    scope: 'PLATFORM',
    scopeId: f.organisationId,
    eventId: null,
    value: 'private-invalid',
    version: 6,
  });
  await store({ scope: 'STATION', scopeId: f.stationId, value: false, version: 8 });
  const response = await get(stationQuery());
  expect(response.status).toBe(200);
  expect(row(response)).toMatchObject({
    value: 15,
    source: { scope: 'default', version: 0 },
    storedVersion: 8,
    invalidScopes: ['station', 'event', 'platform'],
  });
  expect(response.text).not.toContain('private-invalid');
});
it('does not use layers prohibited by a setting’s registry entry', async () => {
  await store({
    key: 'capture.open',
    scope: 'PLATFORM',
    scopeId: f.organisationId,
    eventId: null,
    value: false,
  });
  const response = await get();
  expect(response.status).toBe(200);
  expect(row(response, 'capture.open')).toMatchObject({
    value: true,
    source: { scope: 'default', version: 0 },
    invalidScopes: [],
  });
});
it('reads registered string, list and boolean values through their schemas', async () => {
  await store({ key: 'attendance.campusNetworkLabel', value: 'Synthetic venue network' });
  await store({ key: 'incident.pushSeverities', value: ['CRITICAL'] });
  await store({ key: 'capture.open', value: false });
  const response = await get();
  expect(response.status).toBe(200);
  expect(row(response, 'attendance.campusNetworkLabel')?.value).toBe('Synthetic venue network');
  expect(row(response, 'incident.pushSeverities')?.value).toEqual(['CRITICAL']);
  expect(row(response, 'capture.open')?.value).toBe(false);
});
it('excludes foreign events, organisations, scope IDs and wrongly owned rows', async () => {
  const other = await testEvent();
  // resetDatabase preserves organisations; this fixture must survive repeat runs.
  const org = await rawDb.organisation.upsert({
    where: { slug: 'foreign-settings-org' },
    create: {
      slug: 'foreign-settings-org',
      name: 'Foreign organisation',
      appName: 'Other',
      defaultTimezone: 'Asia/Singapore',
    },
    update: {},
  });
  await store({ eventId: other.eventId, scopeId: other.eventId, value: 27 });
  await store({ scope: 'PLATFORM', scopeId: org.id, eventId: null, value: 28 });
  await store({ scopeId: 'wrong-event-scope', value: 29 });
  await store({ scope: 'PLATFORM', scopeId: f.organisationId, eventId: f.eventId, value: 30 });
  await store({ scope: 'STATION', scopeId: f.stationId, eventId: other.eventId, value: 31 });
  for (const response of [await get(), await get(stationQuery())]) {
    expect(response.status).toBe(200);
    expect(row(response)).toMatchObject({
      value: 15,
      source: { scope: 'default', version: 0 },
      storedVersion: 0,
    });
    expect(response.text).not.toContain(org.id);
  }
});
it('rejects foreign and missing stations without returning settings', async () => {
  const other = await createStation({ code: 'FOREIGN-SETTINGS' });
  for (const stationId of [other.id, 'missing-station']) {
    const response = await get(`?scope=station&stationId=${stationId}`);
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toBeUndefined();
  }
});
it.each([
  '?scope=platform',
  '?scope=station',
  '?stationId=station',
  '?scope=station&stationId=',
  '?scope=event&eventId=foreign',
  '?key=product.countsMode',
  '?scope=event&scope=station',
  '?scope=event&cursor=anything',
])('rejects unsupported query %s without cacheable responses', async (query) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect(response.headers['cache-control']).toBe('no-store');
});
it('rejects anonymous and non-manager reads before exposing any setting', async () => {
  const person = await createVolunteer({ email: 'scoped-reader@test.invalid', role: 'VOLUNTEER' });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  const anonymous = await request(app).get(endpoint());
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  const denied = await request(app).get(endpoint()).set('Authorization', bearer(person));
  expect(denied.status).toBe(403);
  expect(denied.headers['cache-control']).toBe('no-store');
  expect(denied.body.data).toBeUndefined();
});
it.each([
  { role: 'VOLUNTEER' as const },
  { status: 'DEACTIVATED' as const },
  { status: 'INVITED' as const },
  { status: 'ENDED' as const },
])('rechecks current membership behind a stale authorised context: %j', async (data) => {
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data });
  await expect(readScopedSettings({ scope: 'event' }, actor())).rejects.toMatchObject({
    statusCode: 403,
  });
});
it('rejects a mismatched member/person identity and a missing event', async () => {
  await expect(
    readScopedSettings({ scope: 'event' }, { ...actor(), volunteerId: 'wrong-person' }),
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(
    readScopedSettings({ scope: 'event' }, { ...actor(), scope: { eventId: 'missing-event' } }),
  ).rejects.toMatchObject({ statusCode: 404 });
});
it('allows a current manager to read archived values without changing lifecycle state', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  const before = await f.state();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.body.eventStatus).toBe('ARCHIVED');
  expect(await f.state()).toEqual(before);
});
it('rechecks membership after waiting on a concurrent revocation', async () => {
  let reading: ReturnType<typeof readScopedSettings> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    reading = readScopedSettings({ scope: 'event' }, actor());
    void reading.catch(() => undefined);
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
  await expect(reading).rejects.toMatchObject({ statusCode: 403 });
});
it.each(['rows', 'authority', 'station'] as const)(
  'observes committed %s after the Event lock wait and uses the later clock',
  async (change) => {
    let now = lifecycleNow;
    let reading: ReturnType<typeof readScopedSettings> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      reading = readScopedSettings(
        change === 'station' ? { scope: 'station', stationId: f.stationId } : { scope: 'event' },
        { ...actor(), clock: { now: () => now } },
      );
      void reading.catch(() => undefined);
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
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
      else
        await tx.setting.create({
          data: {
            scope: 'EVENT',
            scopeId: f.eventId,
            eventId: f.eventId,
            key: 'silentStationMinutes',
            value: 22,
            version: 3,
          },
        });
    });
    if (change === 'authority') await expect(reading).rejects.toMatchObject({ statusCode: 403 });
    else if (change === 'station') await expect(reading).rejects.toMatchObject({ statusCode: 404 });
    else {
      const result = await reading;
      expect(result?.evaluatedAt).toBe(now.toISOString());
      expect(result?.data.find((entry) => entry.key === 'silentStationMinutes')).toMatchObject({
        value: 22,
        source: { scope: 'event', version: 3 },
        storedVersion: 3,
      });
    }
  },
);
