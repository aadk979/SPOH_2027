import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { createUpload } from '../../src/modules/media/application/createUpload.js';
import { presignUpload } from '../../src/modules/media/application/s3.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
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
  presignUpload: vi.fn(() => Promise.resolve({ url: 'https://bucket.test/upload', fields: {} })),
  presignRead: () => Promise.resolve('https://bucket.test/read'),
}));
let f: ScheduledLifecycleFixture;
const app = createApp();
const intent = {
  purpose: 'lostFound' as const,
  contentType: 'image/jpeg' as const,
  contentLength: 1000,
};
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
});
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  vi.clearAllMocks();
});
it.each(['DEACTIVATED', 'INVITED', 'ENDED'] as const)(
  'does not sign an upload behind current %s membership',
  async (status) => {
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: { status },
    });
    await expect(createUpload(intent, actor(), fixedClock(lifecycleNow))).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(presignUpload).not.toHaveBeenCalled();
    expect(
      await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'media.upload' } }),
    ).toBe(0);
  },
);
it.each(['DRAFT', 'READY', 'CLOSED', 'ARCHIVED'] as const)(
  'does not sign a new photo upload while the event is %s',
  async (status) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    await expect(createUpload(intent, actor(), fixedClock(lifecycleNow))).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(presignUpload).not.toHaveBeenCalled();
    expect(
      await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'media.upload' } }),
    ).toBe(0);
  },
);

it('rejects a changed role or mismatched person before signing', async () => {
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'LEAD' } });
  await expect(createUpload(intent, actor(), fixedClock(lifecycleNow))).rejects.toMatchObject({
    statusCode: 403,
  });
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'ADMIN' } });
  await expect(
    createUpload(intent, { ...actor(), volunteerId: 'wrong-person' }, fixedClock(lifecycleNow)),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(presignUpload).not.toHaveBeenCalled();
  expect(await rawDb.auditLog.count()).toBe(0);
});

it.each(['LIVE', 'REHEARSAL'] as const)(
  'issues an exact bounded policy and event receipt in %s',
  async (status) => {
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const response = await createUpload(intent, actor(), fixedClock(lifecycleNow));
    expect(response.key).toMatch(/^lost-found\/2027\/01\/07\/[a-f0-9-]{36}\.jpg$/);
    expect(response).toMatchObject({ expiresIn: 300, maxBytes: 10 * 1024 * 1024 });
    expect(presignUpload).toHaveBeenCalledExactlyOnceWith({
      key: response.key,
      contentType: 'image/jpeg',
      maxBytes: 10 * 1024 * 1024,
      ttlSeconds: 300,
    });
    expect(
      await rawDb.auditLog.findFirst({ where: { eventId: f.eventId, entityId: response.key } }),
    ).toMatchObject({
      actorId: f.creator.id,
      membershipId: f.membershipId,
      action: 'media.upload',
      entityType: 'MediaObject',
      outcome: 'SUCCESS',
      after: { purpose: 'lostFound', contentType: 'image/jpeg', rehearsal: status === 'REHEARSAL' },
    });
    expect(await rawDb.setting.count()).toBe(0);
  },
);

it.each(['event', 'membership'] as const)(
  'observes revocation after waiting on the %s lock',
  async (lock) => {
    let uploading: ReturnType<typeof createUpload> | undefined;
    await rawDb.$transaction(async (tx) => {
      if (lock === 'event')
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      uploading = createUpload(intent, actor(), fixedClock(lifecycleNow));
      void uploading.catch(() => undefined);
      const pattern =
        lock === 'event' ? '%FROM "Event"%FOR SHARE%' : '%FROM "EventMembership"%FOR SHARE%';
      await expect
        .poll(async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${pattern}`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      await tx.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: 'DEACTIVATED' },
      });
    });
    await expect(uploading).rejects.toMatchObject({ statusCode: 403 });
    expect(presignUpload).not.toHaveBeenCalled();
    expect(await rawDb.auditLog.count()).toBe(0);
  },
);

it('observes event close committed during its event lock wait', async () => {
  let uploading: ReturnType<typeof createUpload> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
    uploading = createUpload(intent, actor(), fixedClock(lifecycleNow));
    void uploading.catch(() => undefined);
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    await tx.event.update({
      where: { id: f.eventId },
      data: { status: 'CLOSED', closedAt: lifecycleNow },
    });
  });
  await expect(uploading).rejects.toMatchObject({ statusCode: 409 });
  expect(presignUpload).not.toHaveBeenCalled();
  expect(await rawDb.auditLog.count()).toBe(0);
});

it('reads the clock after both authority lock waits', async () => {
  let now = lifecycleNow;
  const nextDay = new Date('2027-01-08T03:30:00.000Z');
  let uploading: ReturnType<typeof createUpload> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
    uploading = createUpload(intent, actor(), { now: () => now });
    void uploading.catch(() => undefined);
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "EventMembership"%FOR SHARE%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    now = nextDay;
  });
  expect((await uploading)!.key).toMatch(/^lost-found\/2027\/01\/08\//);
});

it('does not return a policy or write an issuance receipt when signing fails', async () => {
  vi.mocked(presignUpload).mockRejectedValueOnce(new Error('Synthetic signer failure'));
  await expect(createUpload(intent, actor(), fixedClock(lifecycleNow))).rejects.toThrow(
    'Synthetic signer failure',
  );
  expect(await rawDb.auditLog.count()).toBe(0);
});

it('rejects an oversized photo before signing with current scoped limits', async () => {
  await rawDb.setting.create({
    data: {
      scope: 'PLATFORM',
      scopeId: f.organisationId,
      key: 'media.maxUploadBytes',
      value: 1500,
      version: 1,
    },
  });
  await expect(
    createUpload({ ...intent, contentLength: 2000 }, actor(), fixedClock(lifecycleNow)),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(presignUpload).not.toHaveBeenCalled();
  expect(await rawDb.auditLog.count()).toBe(0);
});

it('keeps issued upload credentials and route failures no-store', async () => {
  const path = `/api/v1/events/${f.eventId}/media/uploads`;
  const post = (body: object = intent) =>
    request(app).post(path).set('Authorization', bearer(f.creator)).send(body);
  const accepted = await post();
  expect(accepted.status).toBe(201);
  expect(accepted.headers['cache-control']).toBe('no-store');
  const malformed = await post({ ...intent, contentLength: 0 });
  expect(malformed.status).toBe(400);
  expect(malformed.headers['cache-control']).toBe('no-store');
  const anonymous = await request(app).post(path).send(intent);
  expect(anonymous.status).toBe(401);
  expect(anonymous.headers['cache-control']).toBe('no-store');
  await rawDb.event.update({
    where: { id: f.eventId },
    data: { status: 'CLOSED', closedAt: lifecycleNow },
  });
  const closed = await post();
  expect(closed.status).toBe(409);
  expect(closed.headers['cache-control']).toBe('no-store');
});
