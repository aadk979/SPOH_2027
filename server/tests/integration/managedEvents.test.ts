import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as audit from '../../src/platform/audit/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  makePlatformAdmin,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
let admin: TestVolunteer;
let organisationId: string;
let sourceEventId: string;
const post = (body: object, path = '/events', who = admin) =>
  request(app).post(`/api/v1${path}`).set('Authorization', bearer(who)).send(body);
const createBody = () => ({
  organisationId,
  name: 'New event',
  slug: 'new-event',
  venue: 'Campus',
  timezone: 'Asia/Singapore',
  startDate: '2027-02-01',
  endDate: '2027-02-02',
  joinAsAdmin: true,
  idempotencyKey: idempotencyKey(),
});
const cloneBody = () => ({
  organisationId,
  sourceEventId,
  clone: { name: 'Next event', slug: 'next-event', dayOffsetDays: 365, inviteSamePeople: false },
  joinAsAdmin: true,
  idempotencyKey: idempotencyKey(),
});

beforeEach(async () => {
  await resetDatabase();
  sourceEventId = (await testEvent()).eventId;
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: sourceEventId } }))
    .organisationId;
  admin = await createVolunteer({ email: 'event-admin@example.test', role: 'ADMIN' });
  await makePlatformAdmin(admin.id);
});
afterEach(() => vi.restoreAllMocks());

it('creates a draft with event dates, default role grants and explicit audited joining, once', async () => {
  const body = createBody();
  const [first, retry] = await Promise.all([post(body), post(body)]);
  expect(first.status).toBe(201);
  expect(retry.body).toEqual(first.body);
  const eventId = first.body.event.id as string;
  expect(first.body).toMatchObject({
    joined: true,
    event: { name: 'New event', slug: 'new-event', status: 'DRAFT' },
  });
  expect(await rawDb.eventDay.count({ where: { eventId } })).toBe(2);
  expect(await rawDb.rolePermission.count({ where: { eventId } })).toBeGreaterThan(0);
  expect(
    await rawDb.eventMembership.findFirst({ where: { eventId, personId: admin.id } }),
  ).toMatchObject({ status: 'ACTIVE', role: 'ADMIN', acceptedAt: expect.any(Date) });
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.create' } })).toBe(1);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'user.provision' } })).toBe(1);
  const stored = await rawDb.idempotencyRecord.findUniqueOrThrow({
    where: { key: body.idempotencyKey },
  });
  expect(stored.responseBody).toEqual({ eventId, joined: true, fingerprint: expect.any(String) });
});

it('does not silently join an organiser and works before the organisation has any event', async () => {
  const org = await rawDb.organisation.create({
    data: {
      slug: 'empty-org',
      name: 'Empty',
      appName: 'Empty',
      locale: 'en-SG',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  await rawDb.organisationMembership.create({
    data: { organisationId: org.id, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
  const response = await post({ ...createBody(), organisationId: org.id, joinAsAdmin: false });
  expect(response.status).toBe(201);
  expect(response.body.joined).toBe(false);
  expect(await rawDb.eventMembership.count({ where: { eventId: response.body.event.id } })).toBe(0);
  expect(response.body.event.locale).toBe('en-SG');
});

it('requires current organisation authority even for receipt replays and isolates foreign organisations', async () => {
  const body = createBody();
  expect((await post(body)).status).toBe(201);
  await rawDb.organisationMembership.update({
    where: { organisationId_personId: { organisationId, personId: admin.id } },
    data: { role: 'MEMBER' },
  });
  expect((await post(body)).status).toBe(403);
  const foreign = await rawDb.organisation.create({
    data: {
      slug: 'foreign',
      name: 'Foreign',
      appName: 'Foreign',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  expect((await post({ ...createBody(), organisationId: foreign.id })).status).toBe(404);
});

it('rejects a changed request using a settled key and competing event addresses', async () => {
  const body = createBody();
  expect((await post(body)).status).toBe(201);
  expect((await post({ ...body, name: 'Different request' })).status).toBe(409);
  expect((await post({ ...body, idempotencyKey: idempotencyKey() })).status).toBe(409);
  expect(await rawDb.event.count({ where: { organisationId, slug: body.slug } })).toBe(1);
});

it('rolls back the event, membership and receipt when its audit cannot commit', async () => {
  const body = createBody();
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Audit unavailable'));
  expect((await post(body)).status).toBe(500);
  expect(await rawDb.event.count({ where: { organisationId, slug: body.slug } })).toBe(0);
  expect(
    await rawDb.idempotencyRecord.findUnique({ where: { key: body.idempotencyKey } }),
  ).toBeNull();
});

it('lists archived organisation sources without adding them to the caller event picker', async () => {
  await rawDb.event.update({ where: { id: sourceEventId }, data: { status: 'ARCHIVED' } });
  const manage = await request(app)
    .get('/api/v1/events/administration')
    .set('Authorization', bearer(admin));
  expect(manage.status).toBe(200);
  expect(manage.body.organisations).toContainEqual(
    expect.objectContaining({ id: organisationId, canCreate: true, canClone: true }),
  );
  expect(manage.body.events).toContainEqual(
    expect.objectContaining({ id: sourceEventId, status: 'ARCHIVED' }),
  );
  const mine = await request(app).get('/api/v1/events').set('Authorization', bearer(admin));
  expect(mine.body.data).toEqual([]);
});

it('clones chosen parts and settings into a new draft, resetting reviews and operational rows', async () => {
  await rawDb.setting.create({
    data: {
      eventId: sourceEventId,
      scope: 'EVENT',
      scopeId: sourceEventId,
      key: 'capture.open',
      value: true,
      version: 3,
    },
  });
  const body = {
    ...cloneBody(),
    clone: {
      ...cloneBody().clone,
      copy: {
        categories: false,
        stations: true,
        daysAndShifts: false,
        gifts: false,
        settings: true,
        content: false,
        permissions: false,
      },
    },
  };
  const response = await post(body, '/events/clone');
  expect(response.status).toBe(201);
  const eventId = response.body.event.id as string;
  expect(await rawDb.captureCategory.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.stationType.count({ where: { eventId } })).toBeGreaterThan(0);
  expect(await rawDb.eventDay.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.rolePermission.count({ where: { eventId } })).toBeGreaterThan(0);
  expect(await rawDb.setting.findFirst({ where: { eventId, key: 'capture.open' } })).toMatchObject({
    scopeId: eventId,
    version: 1,
    value: true,
  });
  expect(await rawDb.settingChange.findFirst({ where: { eventId } })).toMatchObject({
    source: 'CLONE',
    version: 1,
  });
  expect(await rawDb.event.findUnique({ where: { id: eventId } })).toMatchObject({
    status: 'DRAFT',
    permissionsReviewedAt: null,
    permissionsReviewedVersion: null,
    clonedFromEventId: sourceEventId,
  });
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  expect((await post(body, '/events/clone')).body).toEqual(response.body);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.clone' } })).toBe(1);
});

it('refuses a clone source outside the selected organisation', async () => {
  const otherOrg = await rawDb.organisation.create({
    data: { slug: 'other-org', name: 'Other', appName: 'Other', defaultTimezone: 'Asia/Singapore' },
  });
  const source = await rawDb.event.create({
    data: {
      organisationId: otherOrg.id,
      slug: 'foreign-source',
      name: 'Foreign',
      timezone: 'Asia/Singapore',
    },
  });
  expect((await post({ ...cloneBody(), sourceEventId: source.id }, '/events/clone')).status).toBe(
    404,
  );
});

it.each([{ timezone: 'Invalid/Zone' }, { endDate: '2026-01-01' }, { slug: 'Spaces not allowed' }])(
  'validates create input before writing: %j',
  async (invalid) => {
    expect((await post({ ...createBody(), ...invalid })).status).toBe(400);
    expect(await rawDb.event.count({ where: { organisationId, slug: 'new-event' } })).toBe(0);
  },
);
