import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContentDraftRecord, PublishedContentRecord, type EventContent } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import {
  useContentStorage,
  type ContentStorage,
} from '../../src/modules/content/application/storage.js';
import { cloneContentInto } from '../../src/modules/content/index.js';
import { contentReferences, frozenContent } from '../../src/modules/content/domain/contentRules.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { guideContent } from '../helpers/content.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';
import { contentScheduledHandlers } from '../../src/modules/content/jobs.js';
import type { ClaimedAction } from '../../src/platform/scheduler/claimRepo.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';

const app = createApp();
const transactionDb = rawDb.$extends({ query: {} });
const objects = new Map<string, Uint8Array>();
const storage: ContentStorage = {
  issueImage: vi.fn(async () => ({
    url: 'https://uploads.example.test',
    fields: { policy: 'signed' },
  })),
  publish: vi.fn<ContentStorage['publish']>(async (input) => {
    const paths = new Map(
      input.images.map((image, index) => [
        image.key,
        `content/${input.eventId}/${input.id}/map-${index}`,
      ]),
    );
    const body = frozenContent(input.body, paths);
    const json = JSON.stringify(body);
    const objectKey = `content/${input.eventId}/${input.id}.json`;
    objects.set(objectKey, Buffer.from(json));
    for (const key of paths.values()) objects.set(key, Buffer.from('frozen image'));
    return { body, objectKey, etag: `"${createHash('sha256').update(json).digest('hex')}"` };
  }),
  read: vi.fn(async (key) => ({
    body: objects.get(key) ?? Buffer.from('image'),
    contentType: 'image/png',
  })),
  copyImage: vi.fn(async (input) => ({
    key: input.key,
    contentType: 'image/png',
    contentLength: 12,
  })),
};
let restore: () => void;
let eventId: string;
let admin: TestVolunteer;
let volunteer: TestVolunteer;
let number = 0;
const get = (path: string, caller = admin) =>
  request(app).get(`/api/v1/events/${eventId}/content${path}`).set('Authorization', bearer(caller));
const write = (path: string, body: object, method: 'post' | 'put' = 'post', caller = admin) =>
  request(app)
    [method](`/api/v1/events/${eventId}/content${path}`)
    .set('Authorization', bearer(caller))
    .send(body);
const save = (body = guideContent(), expectedVersion = 0, key = idempotencyKey()) =>
  write('/draft', { body, expectedVersion, idempotencyKey: key }, 'put');
const review = (version = 1) =>
  write('/review', { expectedVersion: version, idempotencyKey: idempotencyKey() });
const publish = (version = 1, key = idempotencyKey()) =>
  write('/publish', { expectedVersion: version, idempotencyKey: key });

beforeEach(async () => {
  await resetDatabase();
  objects.clear();
  vi.clearAllMocks();
  restore = useContentStorage(storage);
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: `content-admin-${number++}@content.test`, role: 'ADMIN' });
  volunteer = await createVolunteer({
    email: `content-member-${number++}@content.test`,
    role: 'VOLUNTEER',
  });
});
afterEach(() => restore());

it('keeps drafts private, publishes only the reviewed current version and replays once', async () => {
  expect((await get('')).status).toBe(404);
  expect((await get('/draft', volunteer)).status).toBe(403);
  const key = idempotencyKey();
  const saved = await save(guideContent(), 0, key);
  expect(saved.status).toBe(200);
  expect(ContentDraftRecord.parse(saved.body.data)).toMatchObject({
    version: 1,
    reviewedVersion: null,
    publishedVersion: null,
  });
  expect((await save(guideContent(), 0, key)).body).toEqual(saved.body);
  expect(await rawDb.contentDocument.count()).toBe(1);
  expect((await publish()).status).toBe(409);
  expect((await review()).status).toBe(200);
  const publishKey = idempotencyKey();
  const published = await publish(1, publishKey);
  expect(published.status).toBe(200);
  const record = PublishedContentRecord.parse(published.body.data);
  expect((await publish(1, publishKey)).body).toEqual(published.body);
  expect(storage.publish).toHaveBeenCalledTimes(1);
  expect((await get(`?v=${record.id}`)).headers).toMatchObject({
    etag: record.etag,
    'cache-control': 'private, max-age=31536000, immutable',
  });
  expect((await get(`?v=${record.id}`).set('If-None-Match', record.etag)).status).toBe(304);
  expect((await get('')).headers['cache-control']).toBe('no-store');
  expect((await get('/versions')).body.data).toHaveLength(1);
});

it('refuses stale saves and invalidates review without changing the earlier publication', async () => {
  await save();
  await review();
  const first = (await publish()).body.data;
  const changed = guideContent();
  changed.brief.escalationScript = 'Ask the safety lead.';
  expect((await save(changed, 0)).status).toBe(409);
  expect((await save(changed, 1)).status).toBe(200);
  expect((await get('/draft')).body.data).toMatchObject({ version: 2, reviewedVersion: null });
  expect((await publish(2)).status).toBe(409);
  expect((await review(1)).status).toBe(409);
  expect((await get(`?v=${first.id}`)).body.data.body).toEqual(first.body);
});

it('checks role, strict body validation, and event-owned stations and images', async () => {
  expect(
    (
      await write(
        '/draft',
        { body: guideContent(), expectedVersion: 0, idempotencyKey: idempotencyKey() },
        'put',
        volunteer,
      )
    ).status,
  ).toBe(403);
  expect((await save({ ...guideContent(), extra: true } as EventContent)).status).toBe(400);
  const body = guideContent();
  body.journey.steps[0]!.stationIds = ['foreign-station'];
  expect((await save(body)).status).toBe(404);
  body.journey.steps[0]!.stationIds = [];
  body.map.levels[0]!.image = { mediaKey: 'drafts/another-event/image', alt: 'Other floor' };
  expect((await save(body)).status).toBe(404);
  expect((await get('?v=missing')).status).toBe(404);
  expect((await get('/assets/missing/map-0')).status).toBe(404);
  expect((await get('/assets/missing/../drafts')).status).toBe(404);
});

it('issues owned image uploads without persisting signed credentials and freezes committed assets', async () => {
  const key = idempotencyKey();
  const requestBody = { idempotencyKey: key, contentType: 'image/png', contentLength: 12 };
  const issued = await write('/images/upload', requestBody);
  expect(issued.status).toBe(201);
  const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } });
  expect(receipt.responseBody).toEqual({ key: issued.body.data.key });
  expect((await write('/images/upload', requestBody)).body.data.key).toBe(issued.body.data.key);
  expect((await write('/images/upload', { ...requestBody, contentLength: 13 })).status).toBe(409);
  const body = guideContent();
  body.map.levels[0]!.image = { mediaKey: issued.body.data.key, alt: 'Floor plan' };
  await save(body);
  await review();
  const published = (await publish()).body.data;
  expect(published.images).toEqual({
    [published.body.map.levels[0].image.mediaKey]:
      `/events/${eventId}/content/assets/${published.id}/map-0`,
  });
  expect((await get(`/assets/${published.id}/map-0`)).status).toBe(200);
  expect((await get(`/assets/${published.id}/map-1`)).status).toBe(404);
  expect(
    (await get(`/assets/${published.id}/map-0`, volunteer)).headers['cache-control'],
  ).toContain('immutable');
});

it('rolls back publication and audit when immutable upload fails', async () => {
  await save();
  await review();
  vi.mocked(storage.publish).mockRejectedValueOnce(new Error('Storage unavailable'));
  expect((await publish()).status).toBe(500);
  expect(await rawDb.contentVersion.count()).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'content.publish' } })).toBe(0);
  expect((await get('/draft')).body.data.publishedVersion).toBeNull();
  expect((await publish()).status).toBe(200);
});

it('schedules only reviewed future versions and keeps a truthful producer receipt', async () => {
  await save();
  const runAt = new Date(FROZEN_NOW.getTime() + 60_000).toISOString();
  const body = { expectedVersion: 1, runAt, idempotencyKey: idempotencyKey() };
  expect((await write('/schedules', body)).status).toBe(400);
  await review();
  expect(
    (
      await write('/schedules', {
        ...body,
        runAt: FROZEN_NOW.toISOString(),
        idempotencyKey: idempotencyKey(),
      })
    ).status,
  ).toBe(400);
  const response = await write('/schedules', body);
  expect(response.status).toBe(201);
  expect((await write('/schedules', body)).body).toEqual(response.body);
  expect(
    await rawDb.scheduledAction.findFirstOrThrow({ where: { eventId, type: 'content.publish' } }),
  ).toMatchObject({ payload: { expectedVersion: 1 }, createdByPersonId: admin.id });
});

it('copies only the source publication into an unreviewed target-owned draft', async () => {
  const issued = await write('/images/upload', {
    idempotencyKey: idempotencyKey(),
    contentType: 'image/png',
    contentLength: 12,
  });
  const body = guideContent();
  body.map.levels[0]!.image = { mediaKey: issued.body.data.key, alt: 'Floor plan' };
  await save(body);
  await review();
  await publish();
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const target = await rawDb.event.create({
    data: {
      organisationId: event.organisationId,
      name: 'Next event',
      slug: 'next-content',
      timezone: event.timezone,
    },
  });
  await transactionDb.$transaction((tx) =>
    cloneContentInto(tx, {
      sourceEventId: eventId,
      eventId: target.id,
      personId: admin.id,
      now: FROZEN_NOW,
      stationIds: new Map(),
    }),
  );
  const cloned = await rawDb.contentDocument.findUniqueOrThrow({ where: { eventId: target.id } });
  expect(cloned).toMatchObject({ version: 1, reviewedVersion: null, publishedVersionId: null });
  expect(contentReferences(cloned.body as EventContent).images[0]).toMatch(`drafts/${target.id}/`);
  expect(await rawDb.contentUploadReceipt.count({ where: { eventId: target.id } })).toBe(1);
  expect(storage.copyImage).toHaveBeenCalledTimes(1);
});

async function scheduledContent() {
  await save();
  await review();
  await write('/schedules', {
    expectedVersion: 1,
    runAt: new Date(FROZEN_NOW.getTime() + 60_000).toISOString(),
    idempotencyKey: idempotencyKey(),
  });
  const row = await rawDb.scheduledAction.findFirstOrThrow({
    where: { eventId, type: 'content.publish' },
  });
  const member = await rawDb.eventMembership.findUniqueOrThrow({
    where: { eventId_personId: { eventId, personId: admin.id } },
  });
  const audit = {
    ...SYSTEM_AUDIT_CONTEXT,
    source: 'SCHEDULE' as const,
    eventId,
    actorId: admin.id,
    actorSub: admin.sub,
    membershipId: member.id,
    scheduledActionId: row.id,
  };
  return {
    row,
    member,
    audit,
    execute: () =>
      transactionDb.$transaction((tx) =>
        contentScheduledHandlers[0]!.execute({
          tx,
          action: row as unknown as ClaimedAction,
          now: row.runAt,
          audit,
        }),
      ),
  };
}
it('publishes a scheduled version under current authority with schedule provenance', async () => {
  const f = await scheduledContent();
  await f.execute();
  const audit = await rawDb.auditLog.findFirstOrThrow({ where: { action: 'content.publish' } });
  expect(audit).toMatchObject({
    source: 'SCHEDULE',
    scheduledActionId: f.row.id,
    actorId: admin.id,
  });
  expect(await rawDb.contentVersion.count()).toBe(1);
});
it.each(['changed-draft', 'changed-role', 'ended-membership', 'recurrence', 'mismatched-actor'])(
  'refuses scheduled publication after %s without a publication or audit',
  async (change) => {
    const f = await scheduledContent();
    if (change === 'changed-draft') await save(guideContent(), 1);
    if (change === 'changed-role')
      await rawDb.eventMembership.update({
        where: { id: f.member.id },
        data: { role: 'VOLUNTEER' },
      });
    if (change === 'ended-membership')
      await rawDb.eventMembership.update({ where: { id: f.member.id }, data: { status: 'ENDED' } });
    if (change === 'recurrence') f.row.recurrence = 60;
    if (change === 'mismatched-actor') f.audit.actorId = volunteer.id;
    await expect(f.execute()).rejects.toThrow();
    expect(await rawDb.contentVersion.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'content.publish' } })).toBe(0);
  },
);
