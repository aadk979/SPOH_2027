import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { readUrl } from '../../src/modules/media/application/readUrl.js';
import { presignRead } from '../../src/modules/media/application/s3.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, testEvent } from '../helpers/fixtures.js';
import {
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

// Policies and read URLs are fake; these cases never call AWS or upload objects.
vi.mock('../../src/modules/media/application/s3.js', () => ({
  mediaEnabled: () => true,
  assertConfigured: () => undefined,
  presignUpload: () => Promise.resolve({ url: 'https://bucket.test/upload', fields: {} }),
  presignRead: vi.fn(() => Promise.resolve('https://bucket.test/read')),
}));
const app = createApp();
let f: ScheduledLifecycleFixture;
const key = 'lost-found/2027/01/07/bounded-photo.jpg';
const actor = () => ({
  scope: { eventId: f.eventId },
  membershipId: f.membershipId,
  volunteerId: f.creator.id,
  audit: SYSTEM_AUDIT_CONTEXT,
});
const get = (objectKey = key) =>
  request(app)
    .get(`/api/v1/events/${f.eventId}/media/url?key=${encodeURIComponent(objectKey)}`)
    .set('Authorization', bearer(f.creator));
const receipt = (patch: Partial<Prisma.AuditLogUncheckedCreateInput> = {}) =>
  rawDb.auditLog.create({
    data: {
      eventId: f.eventId,
      actorId: f.creator.id,
      actorSub: f.creator.sub,
      membershipId: f.membershipId,
      action: 'media.upload',
      entityType: 'MediaObject',
      entityId: key,
      after: { purpose: 'lostFound', contentType: 'image/jpeg' },
      ...patch,
    },
  });
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  vi.clearAllMocks();
});
it('cannot sign another event’s legitimate upload key even when the caller belongs to both', async () => {
  const other = await testEvent();
  const upload = await request(app)
    .post(`/api/v1/events/${other.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send({
      idempotencyKey: randomUUID(),
      purpose: 'lostFound',
      contentType: 'image/jpeg',
      contentLength: 1000,
    });
  expect(upload.status).toBe(201);
  expect(
    await rawDb.auditLog.findFirst({
      where: { eventId: other.eventId, action: 'media.upload', entityId: upload.body.key },
    }),
  ).not.toBeNull();
  const response = await request(app)
    .get(`/api/v1/events/${f.eventId}/media/url?key=${encodeURIComponent(upload.body.key)}`)
    .set('Authorization', bearer(f.creator));
  expect(response.status).toBe(404);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(presignRead).not.toHaveBeenCalled();
});
it('cannot attach another event’s issued key to a found item', async () => {
  const other = await testEvent();
  const upload = await request(app)
    .post(`/api/v1/events/${other.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send({
      idempotencyKey: randomUUID(),
      purpose: 'lostFound',
      contentType: 'image/jpeg',
      contentLength: 1000,
    });
  expect(upload.status).toBe(201);
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/lost-found`)
    .set('Authorization', bearer(f.creator))
    .send({
      itemLabel: 'Synthetic found object',
      foundStationId: f.stationId,
      photoKey: upload.body.key,
    });
  expect(response.status).toBe(404);
  expect(await rawDb.lostFoundItem.count({ where: { eventId: f.eventId } })).toBe(0);
  expect(
    await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'lostFound.create' } }),
  ).toBe(0);
});
it('signs the event’s issued legacy-format key without exposing or changing its receipt', async () => {
  const original = await receipt();
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toEqual({ url: 'https://bucket.test/read', expiresIn: 300 });
  expect(presignRead).toHaveBeenCalledExactlyOnceWith(key, 300);
  expect(response.text).not.toContain(f.creator.id);
  expect(await rawDb.auditLog.findUnique({ where: { id: original.id } })).toEqual(original);
  expect(await rawDb.auditLog.count()).toBe(1);
  expect(await rawDb.setting.count()).toBe(0);
});
it('allows a normally issued own-event photo to be attached inside the item transaction', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
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
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/lost-found`)
    .set('Authorization', bearer(f.creator))
    .send({
      itemLabel: 'Synthetic object with photo',
      foundStationId: f.stationId,
      photoKey: upload.body.key,
    });
  expect(response.status).toBe(201);
  expect(await rawDb.lostFoundItem.findFirst({ where: { eventId: f.eventId } })).toMatchObject({
    photoKey: upload.body.key,
    rehearsal: true,
  });
  expect((await get(upload.body.key)).status).toBe(200);
});
it.each([
  { eventId: null },
  { outcome: 'DENIED' as const },
  { outcome: 'FAILURE' as const },
  { action: 'lostFound.create' },
  { entityType: 'OtherObject' },
])('rejects an untrusted receipt %j before signing', async (patch) => {
  await receipt(patch);
  const response = await get();
  expect(response.status).toBe(404);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(presignRead).not.toHaveBeenCalled();
});
it.each(['lost-found/unknown.jpg', 'backups/private.dump', 'lost-found/../backups/private.dump'])(
  'rejects an unissued or unsupported key %s',
  async (objectKey) => {
    expect((await get(objectKey)).status).toBe(404);
    expect(presignRead).not.toHaveBeenCalled();
  },
);
it('rejects an unissued attachment without creating an item or its audit', async () => {
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/lost-found`)
    .set('Authorization', bearer(f.creator))
    .send({ itemLabel: 'Synthetic object', photoKey: key });
  expect(response.status).toBe(404);
  expect(await rawDb.lostFoundItem.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
});
it.each(['DEACTIVATED', 'INVITED', 'ENDED'] as const)(
  'rechecks current %s membership behind a previously authorised context',
  async (status) => {
    await receipt();
    await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { status } });
    await expect(readUrl(key, actor())).rejects.toMatchObject({ statusCode: 403 });
    expect(presignRead).not.toHaveBeenCalled();
  },
);
it('rejects a mismatched caller/member identity', async () => {
  await receipt();
  await expect(readUrl(key, { ...actor(), volunteerId: 'wrong-person' })).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(presignRead).not.toHaveBeenCalled();
});
it('keeps anonymous and malformed read responses no-store', async () => {
  const prefix = `/api/v1/events/${f.eventId}/media/url`;
  const anonymous = await request(app).get(`${prefix}?key=${encodeURIComponent(key)}`);
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  for (const query of ['', '?key=', '?key=x&eventId=foreign']) {
    const response = await request(app)
      .get(`${prefix}${query}`)
      .set('Authorization', bearer(f.creator));
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(presignRead).not.toHaveBeenCalled();
});
it('allows an active member to read an issued archived-event photo without changing state', async () => {
  await receipt();
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'ARCHIVED' } });
  const original = await f.state();
  expect((await get()).status).toBe(200);
  expect(await f.state()).toEqual(original);
});
it.each(['event', 'membership'] as const)(
  'observes current revocation after the %s lock wait before minting a URL',
  async (lock) => {
    await receipt();
    let reading: ReturnType<typeof readUrl> | undefined;
    await rawDb.$transaction(async (tx) => {
      if (lock === 'event')
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      reading = readUrl(key, actor());
      void reading.catch(() => undefined);
      const pattern =
        lock === 'event' ? '%FROM "Event"%FOR SHARE%' : '%FROM "EventMembership"%FOR SHARE%';
      await expect
        .poll(async () => {
          const waits = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
          return Number(waits[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(reading).rejects.toMatchObject({ statusCode: 403 });
    expect(presignRead).not.toHaveBeenCalled();
  },
);
