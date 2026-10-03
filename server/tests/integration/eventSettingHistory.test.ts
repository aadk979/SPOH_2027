import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import {
  EventSettingHistoryResponse,
  SettingChangeSource,
  type EventSettingKey,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { readEventSettingHistory } from '../../src/modules/settings/application/readEventSettingHistory.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer } from '../helpers/fixtures.js';
import {
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

const app = createApp();
let f: ScheduledLifecycleFixture;
const key: EventSettingKey = 'product.countsMode';
const actor = () => ({
  scope: { eventId: f.eventId },
  volunteerId: f.creator.id,
  membershipId: f.membershipId,
  audit: SYSTEM_AUDIT_CONTEXT,
  clock: fixedClock(lifecycleNow),
});
const endpoint = () => `/api/v1/events/${f.eventId}/admin/event-settings/history`;
const get = (query = '?key=product.countsMode') =>
  request(app).get(`${endpoint()}${query}`).set('Authorization', bearer(f.creator));
const create = (
  input: {
    id?: string;
    key?: string;
    source?: SettingChangeSource;
    version?: number;
    scope?: 'EVENT' | 'STATION' | 'PLATFORM';
    scopeId?: string;
    eventId?: string | null;
    actorPersonId?: string | null;
    before?: object | string;
    after?: object | string;
    reason?: string;
  } = {},
) =>
  rawDb.settingChange.create({
    data: {
      eventId: f.eventId,
      scope: 'EVENT',
      scopeId: f.eventId,
      key,
      version: 1,
      before: { mode: 'separate' },
      after: { mode: 'headline', source: { count: 'registrations' } },
      source: 'USER',
      actorPersonId: f.creator.id,
      createdAt: lifecycleNow,
      ...input,
    },
  });
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
});

it('returns strict no-store history with validated values, bounded metadata and no effects', async () => {
  await create({ reason: 'Choose the registration headline' });
  const before = await rawDb.settingChange.findMany();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(EventSettingHistoryResponse.parse(response.body)).toMatchObject({
    eventId: f.eventId,
    key,
    data: [
      {
        version: 1,
        source: 'USER',
        createdByYou: true,
        reason: 'Choose the registration headline',
        values: {
          available: true,
          before: { mode: 'separate' },
          after: { mode: 'headline', source: { count: 'registrations' } },
        },
      },
    ],
    meta: { count: 1, nextCursor: null },
  });
  for (const value of [f.creator.id, 'actorPersonId', 'scheduledActionId', 'scopeId'])
    expect(response.text).not.toContain(value);
  expect(await rawDb.settingChange.findMany()).toEqual(before);
  expect(await rawDb.setting.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
});
it('returns an empty collection for an unchanged supported key', async () => {
  expect((await get()).body).toMatchObject({ data: [], meta: { count: 0, nextCursor: null } });
});
it.each(SettingChangeSource.options)(
  'returns bounded %s history without changing it',
  async (source) => {
    await create({ source });
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.body.data[0].source).toBe(source);
    if (source === 'RESET')
      expect(response.body.data[0].values.after).toEqual({ mode: 'separate' });
  },
);
it('shows visitor mode metadata without forwarding visitor personal fields', async () => {
  await create({ key: 'product.visitorDataMode', before: 'none', after: 'allowlist' });
  const response = await get('?key=product.visitorDataMode');
  expect(response.status).toBe(200);
  expect(response.body.data[0].values).toEqual({
    available: true,
    before: 'none',
    after: 'allowlist',
  });
});
it('omits malformed legacy values and private unknown fields instead of forwarding JSON', async () => {
  await create({
    before: { personal: 'private-before' },
    after: { mode: 'headline', source: { count: 'registrations' }, personal: 'private-after' },
  });
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.body.data[0].values).toEqual({ available: false });
  expect(response.text).not.toContain('private-');
});
it('can show a valid after value when the historical before value is unavailable', async () => {
  await create({ before: { personal: 'private-before' } });
  const response = await get();
  expect(response.body.data[0].values).toMatchObject({ available: true, before: null });
  expect(response.text).not.toContain('private-before');
});
it('truncates legacy reason length and does not invent attribution for a system change', async () => {
  await create({ actorPersonId: null, reason: 'x'.repeat(700) });
  const response = await get();
  expect(response.body.data[0].reason).toHaveLength(500);
  expect(response.body.data[0].createdByYou).toBe(false);
});
it('paginates tied immutable creation times without duplication', async () => {
  for (const id of ['history-a', 'history-b', 'history-c']) await create({ id });
  const first = await get('?key=product.countsMode&limit=2');
  expect(first.body.data.map(({ id }: { id: string }) => id)).toEqual(['history-c', 'history-b']);
  expect(first.body.meta.nextCursor).toBe('history-b');
  const second = await get('?key=product.countsMode&limit=2&cursor=history-b');
  expect(second.status).toBe(200);
  expect(second.body.data.map(({ id }: { id: string }) => id)).toEqual(['history-a']);
  expect(second.body.meta.nextCursor).toBeNull();
});
it('excludes foreign-event, platform, station and other-key history and rejects their cursors', async () => {
  const other = await createEvent({
    organisationId: f.organisationId,
    slug: 'history-foreign-event',
    name: 'Other event',
    timezone: 'Asia/Singapore',
    locale: 'en-SG',
    dayBoundaryMinutes: 0,
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const excluded = [
    await create({ eventId: other.id, scopeId: other.id }),
    await create({ eventId: null, scope: 'PLATFORM', scopeId: 'platform-owner' }),
    await create({ scope: 'STATION', scopeId: 'private-station' }),
    await create({ key: 'product.visitorDataMode', before: 'none', after: 'allowlist' }),
    await create({ scopeId: 'wrong-event-scope' }),
  ];
  await create({ id: 'visible-history' });
  const response = await get();
  expect(response.body.data.map(({ id }: { id: string }) => id)).toEqual(['visible-history']);
  for (const row of excluded)
    expect((await get(`?key=product.countsMode&cursor=${row.id}`)).status).toBe(404);
  expect((await get('?key=product.countsMode&cursor=missing-history')).status).toBe(404);
});
it.each([
  '',
  '?key=capture.open',
  '?key=toString',
  '?key=product.countsMode&limit=201',
  '?key=product.countsMode&scope=PLATFORM',
  '?key=product.countsMode&eventId=foreign',
])('rejects malformed or unsupported query %s', async (query) => {
  expect((await get(query)).status).toBe(400);
});
it('rejects anonymous and current non-manager reads', async () => {
  const person = await createVolunteer({ email: 'history-reader@test.invalid', role: 'VOLUNTEER' });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: person.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  expect((await request(app).get(`${endpoint()}?key=product.countsMode`)).status).toBe(401);
  expect(
    (
      await request(app)
        .get(`${endpoint()}?key=product.countsMode`)
        .set('Authorization', bearer(person))
    ).status,
  ).toBe(403);
});
it('rechecks current membership behind an already authorised context', async () => {
  await rawDb.eventMembership.update({
    where: { id: f.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  await expect(readEventSettingHistory({ key, limit: 50 }, actor())).rejects.toMatchObject({
    statusCode: 403,
  });
});
it.each(['rows', 'authority'])(
  'observes committed %s and evaluates the clock after the Event lock wait',
  async (change) => {
    let now = lifecycleNow;
    let reading: ReturnType<typeof readEventSettingHistory> | undefined;
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      reading = readEventSettingHistory(
        { key, limit: 50 },
        { ...actor(), clock: { now: () => now } },
      );
      void reading.catch(() => undefined);
      await expect
        .poll(async () => {
          const waiting = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
          return Number(waiting[0]!.count);
        })
        .toBeGreaterThan(0);
      now = new Date(lifecycleNow.getTime() + 60_000);
      if (change === 'authority')
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { role: 'VOLUNTEER' },
        });
      else
        await tx.settingChange.create({
          data: {
            eventId: f.eventId,
            scope: 'EVENT',
            scopeId: f.eventId,
            key,
            version: 1,
            before: { mode: 'separate' },
            after: { mode: 'separate' },
            source: 'USER',
            createdAt: lifecycleNow,
          },
        });
    });
    if (change === 'authority') await expect(reading).rejects.toMatchObject({ statusCode: 403 });
    else
      expect(await reading).toMatchObject({ evaluatedAt: now.toISOString(), meta: { count: 1 } });
  },
);
