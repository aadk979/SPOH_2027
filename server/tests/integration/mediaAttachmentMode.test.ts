import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { logItem } from '../../src/modules/lostFound/application/logItem.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { sensitiveRateLimit } from '../../src/platform/http/rateLimit.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer } from '../helpers/fixtures.js';
import {
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
  lifecycleNow,
} from '../helpers/scheduledLifecycle.js';

vi.mock('../../src/modules/media/application/s3.js', () => ({
  mediaEnabled: () => true,
  assertConfigured: () => undefined,
  presignUpload: () => Promise.resolve({ url: 'https://bucket.test/upload', fields: {} }),
  presignRead: () => Promise.resolve('https://bucket.test/read'),
}));
const app = createApp();
let f: ScheduledLifecycleFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  sensitiveRateLimit.resetKey(`sub:${f.creator.sub}`);
});
const actor = () => ({
  scope: { eventId: f.eventId },
  membershipId: f.membershipId,
  volunteerId: f.creator.id,
  audit: {
    ...SYSTEM_AUDIT_CONTEXT,
    eventId: f.eventId,
    membershipId: f.membershipId,
    actorId: f.creator.id,
    actorSub: f.creator.sub,
  },
  clock: fixedClock(lifecycleNow),
});
const upload = async () => {
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send({
      idempotencyKey: randomUUID(),
      purpose: 'lostFound',
      contentType: 'image/png',
      contentLength: 1000,
    });
  expect(response.status).toBe(201);
  return response.body.key as string;
};
const attach = (key: string) =>
  request(app)
    .post(`/api/v1/events/${f.eventId}/lost-found`)
    .set('Authorization', bearer(f.creator))
    .send({ itemLabel: 'Synthetic object', foundStationId: f.stationId, photoKey: key });
const read = (key: string) =>
  request(app)
    .get(`/api/v1/events/${f.eventId}/media/url?key=${encodeURIComponent(key)}`)
    .set('Authorization', bearer(f.creator));
it.each([
  ['REHEARSAL', 'LIVE'],
  ['LIVE', 'REHEARSAL'],
] as const)('does not attach a %s photo to a new %s item', async (issued, current) => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: issued } });
  const upload = await request(app)
    .post(`/api/v1/events/${f.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send({
      idempotencyKey: randomUUID(),
      purpose: 'lostFound',
      contentType: 'image/png',
      contentLength: 1000,
    });
  expect(upload.status).toBe(201);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: current } });
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/lost-found`)
    .set('Authorization', bearer(f.creator))
    .send({
      itemLabel: 'Synthetic object',
      foundStationId: f.stationId,
      photoKey: upload.body.key,
      rehearsal: current === 'REHEARSAL',
    });
  expect(response.status).toBe(409);
  expect(await rawDb.lostFoundItem.count({ where: { eventId: f.eventId } })).toBe(0);
  expect(
    await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'lostFound.create' } }),
  ).toBe(0);
});

it.each(['LIVE', 'REHEARSAL'] as const)(
  'keeps same-mode %s photos attachable with stored item provenance',
  async (status) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const key = await upload();
    expect((await attach(key)).status).toBe(201);
    const item = await rawDb.lostFoundItem.findFirstOrThrow({ where: { eventId: f.eventId } });
    expect(item).toMatchObject({ photoKey: key, rehearsal: status === 'REHEARSAL' });
    expect(
      (
        await rawDb.auditLog.findFirstOrThrow({
          where: { eventId: f.eventId, action: 'lostFound.create' },
        })
      ).after,
    ).toMatchObject({ rehearsal: status === 'REHEARSAL' });
  },
);

it.each([
  {},
  { rehearsal: null },
  { rehearsal: 'false' },
  { rehearsal: 0 },
  { rehearsal: { value: true } },
])(
  'rejects missing or nonboolean provenance %j without breaking historical reads',
  async (metadata) => {
    const key = await upload();
    await rawDb.auditLog.updateMany({
      where: { eventId: f.eventId, entityId: key },
      data: { after: { purpose: 'lostFound', contentType: 'image/png', ...metadata } },
    });
    expect((await attach(key)).status).toBe(404);
    expect(await rawDb.lostFoundItem.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'lostFound.create' } })).toBe(0);
    const historical = await read(key);
    expect(historical.status).toBe(200);
    expect(historical.headers['cache-control']).toBe('no-store');
  },
);

it('accepts a trusted older issuance mode without requiring new retry metadata', async () => {
  const key = await upload();
  await rawDb.auditLog.updateMany({
    where: { entityId: key },
    data: { after: { purpose: 'lostFound', contentType: 'image/png', rehearsal: true } },
  });
  expect((await attach(key)).status).toBe(201);
});

it.each(['DEACTIVATED', 'INVITED', 'ENDED'] as const)(
  'refuses a previously authenticated %s member at item admission',
  async (status) => {
    const key = await upload();
    await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { status } });
    await expect(
      logItem(
        { itemLabel: 'Synthetic object', foundStationId: f.stationId, photoKey: key },
        actor(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await rawDb.lostFoundItem.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'lostFound.create' } })).toBe(0);
  },
);

it('rechecks current role and exact person even when no photo is attached', async () => {
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'LEAD' } });
  await expect(
    logItem({ itemLabel: 'Synthetic object', foundStationId: f.stationId }, actor()),
  ).rejects.toMatchObject({ statusCode: 403 });
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'ADMIN' } });
  await expect(
    logItem(
      { itemLabel: 'Synthetic object', foundStationId: f.stationId },
      { ...actor(), volunteerId: 'other-person' },
    ),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(await rawDb.lostFoundItem.count()).toBe(0);
});

it.each(['event', 'membership'] as const)(
  'observes revocation committed during its %s lock wait',
  async (lock) => {
    const key = await upload();
    let pending: ReturnType<typeof logItem> | undefined;
    await rawDb.$transaction(async (tx) => {
      if (lock === 'event')
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      pending = logItem(
        { itemLabel: 'Synthetic object', foundStationId: f.stationId, photoKey: key },
        actor(),
      );
      void pending.catch(() => undefined);
      const pattern =
        lock === 'event' ? '%FROM "Event"%FOR SHARE%' : '%FROM "EventMembership"%FOR SHARE%';
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${pattern}`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(pending).rejects.toMatchObject({ statusCode: 403 });
    expect(await rawDb.lostFoundItem.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'lostFound.create' } })).toBe(0);
  },
);

it('compares photo provenance after observing a phase change at the event lock', async () => {
  const key = await upload();
  let pending: ReturnType<typeof logItem> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    pending = logItem(
      { itemLabel: 'Synthetic object', foundStationId: f.stationId, photoKey: key },
      actor(),
    );
    void pending.catch(() => undefined);
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    await tx.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
  });
  await expect(pending).rejects.toMatchObject({ statusCode: 409 });
  expect(await rawDb.lostFoundItem.count()).toBe(0);
});

it('samples admission time after waiting on the current member', async () => {
  let now = lifecycleNow;
  const clock = { now: vi.fn(() => now) };
  let pending: ReturnType<typeof logItem> | undefined;
  const later = new Date('2027-01-08T03:30:00Z');
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    pending = logItem(
      { itemLabel: 'Synthetic object', foundStationId: f.stationId },
      { ...actor(), clock },
    );
    void pending.catch(() => undefined);
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    expect(clock.now).not.toHaveBeenCalled();
    now = later;
  });
  expect((await pending)!.foundAt).toBe(later.toISOString());
});
