import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { presignUpload } from '../../src/modules/media/application/s3.js';
import { replayUpload } from '../../src/modules/media/application/replayUpload.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { sensitiveRateLimit } from '../../src/platform/http/rateLimit.js';
import { reserve, settle } from '../../src/platform/idempotency/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent } from '../helpers/fixtures.js';
import {
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
  lifecycleNow,
} from '../helpers/scheduledLifecycle.js';

vi.mock('../../src/platform/idempotency/index.js', async (original) => {
  const actual = await original<typeof import('../../src/platform/idempotency/index.js')>();
  return { ...actual, settle: vi.fn(actual.settle) };
});

vi.mock('../../src/modules/media/application/s3.js', () => ({
  mediaEnabled: () => true,
  assertConfigured: () => undefined,
  presignUpload: vi.fn(() =>
    Promise.resolve({
      url: 'https://bucket.test/upload',
      fields: { policy: 'synthetic-policy-never-persist' },
    }),
  ),
  presignRead: () => Promise.resolve('https://bucket.test/read'),
}));
const app = createApp();
let f: ScheduledLifecycleFixture;
const intent = { purpose: 'lostFound', contentType: 'image/png', contentLength: 1000 };
const post = (body: object) =>
  request(app)
    .post(`/api/v1/events/${f.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send(body);
const body = () => ({ ...intent, idempotencyKey: randomUUID() });
const actor = () => ({
  scope: { eventId: f.eventId },
  membershipId: f.membershipId,
  volunteerId: f.creator.id,
  audit: SYSTEM_AUDIT_CONTEXT,
});
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'REHEARSAL' } });
  sensitiveRateLimit.resetKey(`sub:${f.creator.sub}`);
  vi.mocked(presignUpload)
    .mockReset()
    .mockResolvedValue({
      url: 'https://bucket.test/upload',
      fields: { policy: 'synthetic-policy-never-persist' },
    });
  vi.clearAllMocks();
});
it('requires a client request UUID before signing a retryable upload intent', async () => {
  const response = await post(intent);
  expect(response.status).toBe(400);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(await rawDb.auditLog.count()).toBe(0);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
});
it('reissues the same object key with one audit receipt and no stored signed credentials', async () => {
  const body = { ...intent, idempotencyKey: randomUUID() };
  const first = await post(body);
  expect(first.status).toBe(201);
  const replay = await post(body);
  expect(replay.status).toBe(201);
  expect(replay.body.key).toBe(first.body.key);
  expect(replay.headers['cache-control']).toBe('no-store');
  expect(
    await rawDb.auditLog.count({ where: { eventId: f.eventId, action: 'media.upload' } }),
  ).toBe(1);
  const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({
    where: { key: body.idempotencyKey },
  });
  expect(receipt.statusCode).toBe(201);
  expect(receipt.responseBody).toEqual({ key: first.body.key });
  expect(JSON.stringify(receipt)).not.toContain('synthetic-policy-never-persist');
});

it.each([{ contentType: 'image/jpeg' }, { contentLength: 999 }])(
  'rejects changed intent %j without replacing the receipt',
  async (patch) => {
    const original = body();
    const first = await post(original);
    const before = await rawDb.idempotencyRecord.findUniqueOrThrow({
      where: { key: original.idempotencyKey },
    });
    vi.clearAllMocks();
    const response = await post({ ...original, ...patch });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(presignUpload).not.toHaveBeenCalled();
    expect(
      await rawDb.idempotencyRecord.findUnique({ where: { key: original.idempotencyKey } }),
    ).toEqual(before);
    expect(first.status).toBe(201);
  },
);

it.each(['DRAFT', 'READY', 'CLOSED', 'ARCHIVED', 'LIVE'] as const)(
  'refuses a rehearsal receipt after transition to %s',
  async (status) => {
    const original = body();
    await post(original);
    vi.clearAllMocks();
    await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    const response = await post(original);
    expect(response.status).toBe(409);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(presignUpload).not.toHaveBeenCalled();
    expect(await rawDb.auditLog.count()).toBe(1);
  },
);

it.each(['DEACTIVATED', 'INVITED', 'ENDED'] as const)(
  'refuses replay after membership becomes %s',
  async (status) => {
    const original = body();
    await post(original);
    vi.clearAllMocks();
    await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { status } });
    const response = await post(original);
    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(presignUpload).not.toHaveBeenCalled();
  },
);

it('rejects a changed role and a different current person', async () => {
  const original = body();
  await post(original);
  vi.clearAllMocks();
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'LEAD' } });
  expect((await post(original)).status).toBe(403);
  const other = await createVolunteer({ email: 'other-media@test.example', role: 'ADMIN' });
  await rawDb.eventMembership.create({
    data: { eventId: f.eventId, personId: other.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  const response = await request(app)
    .post(`/api/v1/events/${f.eventId}/media/uploads`)
    .set('Authorization', bearer(other))
    .send(original);
  expect(response.status).toBe(409);
  expect(presignUpload).not.toHaveBeenCalled();
});

it('rejects the same UUID in another event', async () => {
  const original = body();
  await post(original);
  vi.clearAllMocks();
  const other = await testEvent();
  const response = await request(app)
    .post(`/api/v1/events/${other.eventId}/media/uploads`)
    .set('Authorization', bearer(f.creator))
    .send(original);
  expect(response.status).toBe(409);
  expect(presignUpload).not.toHaveBeenCalled();
});

it.each(['eventId', 'actorId', 'outcome', 'action', 'entityType', 'after'] as const)(
  'requires an immutable matching receipt (%s)',
  async (field) => {
    const original = body();
    const first = await post(original);
    vi.clearAllMocks();
    const patches = {
      eventId: null,
      actorId: null,
      outcome: 'DENIED' as const,
      action: 'other',
      entityType: 'Other',
      after: { purpose: 'lostFound', contentType: 'image/png' },
    };
    await rawDb.auditLog.updateMany({
      where: { entityId: first.body.key },
      data: { [field]: patches[field] },
    });
    expect((await post(original)).status).toBe(404);
    expect(presignUpload).not.toHaveBeenCalled();
  },
);

it('applies current organisation limits when rebuilding a policy', async () => {
  const original = { ...body(), contentLength: 2000 };
  const first = await post(original);
  vi.clearAllMocks();
  await rawDb.setting.createMany({
    data: [
      {
        scope: 'PLATFORM',
        scopeId: f.organisationId,
        key: 'media.maxUploadBytes',
        value: 3000,
        version: 1,
      },
      {
        scope: 'PLATFORM',
        scopeId: f.organisationId,
        key: 'media.uploadTtlSeconds',
        value: 120,
        version: 1,
      },
    ],
  });
  const replay = await post(original);
  expect(replay.status).toBe(201);
  expect(replay.body).toMatchObject({ key: first.body.key, maxBytes: 3000, expiresIn: 120 });
  await rawDb.setting.updateMany({ where: { key: 'media.maxUploadBytes' }, data: { value: 1500 } });
  vi.clearAllMocks();
  expect((await post(original)).status).toBe(400);
  expect(presignUpload).not.toHaveBeenCalled();
});

it('releases a failed fresh signing reservation for a genuine retry', async () => {
  const original = body();
  vi.mocked(presignUpload).mockRejectedValueOnce(new Error('Synthetic signing failure'));
  expect((await post(original)).status).toBe(500);
  expect(await rawDb.idempotencyRecord.count()).toBe(0);
  expect(await rawDb.auditLog.count()).toBe(0);
  expect((await post(original)).status).toBe(201);
});

it('keeps a settled receipt when replay signing fails', async () => {
  const original = body();
  const first = await post(original);
  vi.mocked(presignUpload).mockRejectedValueOnce(new Error('Synthetic replay signing failure'));
  expect((await post(original)).status).toBe(500);
  expect((await post(original)).body.key).toBe(first.body.key);
  expect(await rawDb.auditLog.count()).toBe(1);
});

it('commits the identifier with the issuance even when response bookkeeping fails', async () => {
  const original = body();
  vi.mocked(settle).mockRejectedValueOnce(new Error('Synthetic middleware settle failure'));
  const first = await post(original);
  expect(first.status).toBe(201);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: original.idempotencyKey } }))
      .responseBody,
  ).toEqual({ key: first.body.key });
  expect((await post(original)).body.key).toBe(first.body.key);
  expect(await rawDb.auditLog.count()).toBe(1);
});

it('prevents concurrent duplicate issuance and recovers an abandoned reservation', async () => {
  const original = body();
  let release!: (value: { url: string; fields: Record<string, string> }) => void;
  vi.mocked(presignUpload).mockImplementationOnce(
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  const first = post(original).then((response) => response);
  await expect.poll(() => Boolean(release)).toBe(true);
  const duplicate = await post(original);
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe('IDEMPOTENCY_IN_PROGRESS');
  release({ url: 'https://bucket.test/upload', fields: {} });
  const completed = await first;
  expect((await post(original)).body.key).toBe(completed.body.key);
  expect(await rawDb.auditLog.count()).toBe(1);
  const abandoned = body();
  await reserve(abandoned.idempotencyKey, {
    endpoint: 'media.upload',
    eventId: f.eventId,
    actorSub: f.creator.sub,
  });
  await rawDb.idempotencyRecord.update({
    where: { key: abandoned.idempotencyKey },
    data: { createdAt: new Date('2000-01-01T00:00:00Z') },
  });
  expect((await post(abandoned)).status).toBe(201);
  expect(await rawDb.auditLog.count()).toBe(2);
});

it.each(['event', 'membership'] as const)(
  'rechecks replay authority after a %s lock wait',
  async (lock) => {
    const original = body();
    const first = await post(original);
    vi.clearAllMocks();
    let replay: ReturnType<typeof replayUpload> | undefined;
    await rawDb.$transaction(async (tx) => {
      if (lock === 'event')
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${f.eventId} FOR UPDATE`;
      else
        await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE id = ${f.membershipId} FOR UPDATE`;
      replay = replayUpload(
        {
          key: first.body.key,
          request: { ...original, purpose: 'lostFound', contentType: 'image/png' },
          actor: actor(),
        },
        fixedClock(lifecycleNow),
      );
      void replay.catch(() => undefined);
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
      if (lock === 'event')
        await tx.event.update({
          where: { id: f.eventId },
          data: { status: 'CLOSED', closedAt: lifecycleNow },
        });
      else
        await tx.eventMembership.update({
          where: { id: f.membershipId },
          data: { status: 'DEACTIVATED' },
        });
    });
    await expect(replay).rejects.toMatchObject({ statusCode: lock === 'event' ? 409 : 403 });
    expect(presignUpload).not.toHaveBeenCalled();
    expect(await rawDb.auditLog.count()).toBe(1);
  },
);
