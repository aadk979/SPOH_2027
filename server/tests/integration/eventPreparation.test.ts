import pg from 'pg';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as lifecycleRepo from '../../src/modules/event/data/lifecycleRepo.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
let volunteer: TestVolunteer;
let stationId: string;
let fixtureNumber = 0;
const post = (body: object, who = admin) =>
  request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(who))
    .send(body);
const body = (to: 'DRAFT' | 'READY' | 'REHEARSAL', expectedVersion: number) => ({
  to,
  expectedVersion,
  idempotencyKey: idempotencyKey(),
});
const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });

beforeEach(async () => {
  await resetDatabase();
  const source = await testEvent();
  const organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: source.eventId } }))
    .organisationId;
  admin = await createVolunteer({
    email: `admin-${fixtureNumber++}@preparation.test`,
    role: 'ADMIN',
  });
  volunteer = await createVolunteer({ email: 'volunteer@preparation.test', role: 'VOLUNTEER' });
  const event = await createEvent({
    organisationId,
    slug: 'preparation',
    name: 'Preparation',
    timezone: 'Asia/Singapore',
    categories: [{ code: 'VISITOR', label: 'Visitor' }],
    stationTypes: [{ code: 'BOOTH', label: 'Booth', registersVisitors: true, countsEntry: true }],
    shiftTemplates: [{ code: 'SHIFT', label: 'Shift', startLocal: '09:00', endLocal: '10:00' }],
  });
  eventId = event.id;
  await rawDb.eventMembership.createMany({
    data: [admin, volunteer].map((who) => ({
      eventId,
      personId: who.id,
      role: who.role,
      status: 'ACTIVE',
    })),
  });
  await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor('2027-01-07'), label: 'Day' },
  });
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId, code: 'BOOTH' } });
  stationId = (
    await rawDb.station.create({ data: { eventId, typeId: type.id, code: 'BOOTH', name: 'Booth' } })
  ).id;
});

it('walks preparation edges, audits server guards and replays without a second change', async () => {
  const readyRequest = { ...body('READY', 0), reason: 'Structure reviewed' };
  const ready = await post(readyRequest);
  expect(ready.status).toBe(200);
  expect(ready.body.lifecycle).toEqual({
    eventId,
    status: 'READY',
    version: 1,
    hasBeenLive: false,
  });
  expect((await post(readyRequest)).body).toEqual(ready.body);
  expect((await post(body('REHEARSAL', 1))).body.lifecycle.status).toBe('REHEARSAL');
  expect((await post(body('READY', 2))).body.lifecycle.version).toBe(3);
  expect((await post(body('DRAFT', 3))).body.lifecycle.version).toBe(4);
  const audit = await rawDb.auditLog.findMany({
    where: { eventId, action: 'event.transition' },
    orderBy: { createdAt: 'asc' },
  });
  expect(audit).toHaveLength(4);
  // Frozen clocks can tie audit timestamps; lifecycle versions identify each transition.
  expect(audit.map((entry) => (entry.after as { version: number }).version).sort()).toEqual([
    1, 2, 3, 4,
  ]);
  expect(
    audit.find((entry) => (entry.after as { version: number }).version === 1)?.after,
  ).toMatchObject({
    status: 'READY',
    version: 1,
    action: 'Event.MarkReady',
    reason: 'Structure reviewed',
    guardResults: {
      structure: { eventDays: 1, shiftTemplates: 1, registrationStationTypes: 1 },
      blockers: [],
    },
  });
  const read = await request(app)
    .get(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin));
  expect(read.body.lifecycle).toMatchObject({ status: 'DRAFT', version: 4 });
});

it.each(['timezone', 'event-days', 'shift-templates', 'station-types', 'categories'])(
  'refuses missing server-owned structure: %s',
  async (missing) => {
    if (missing === 'timezone')
      await rawDb.event.update({ where: { id: eventId }, data: { timezone: 'Invalid/Zone' } });
    if (missing === 'event-days') await rawDb.eventDay.deleteMany({ where: { eventId } });
    if (missing === 'shift-templates')
      await rawDb.shiftTemplate.updateMany({ where: { eventId }, data: { active: false } });
    if (missing === 'station-types')
      await rawDb.stationType.updateMany({ where: { eventId }, data: { active: false } });
    if (missing === 'categories')
      await rawDb.captureCategory.updateMany({ where: { eventId }, data: { active: false } });
    const refused = await post(body('READY', 0));
    expect(refused.status).toBe(409);
    expect(refused.body.error.details.blockers).toContain(missing);
    expect((await state()).status).toBe('DRAFT');
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(0);
  },
);

it('refuses illegal edges, stale versions, foreign body ids and an unavailable go-live checklist', async () => {
  expect((await post(body('REHEARSAL', 0))).body.error.details.blockers).toEqual([
    'illegal-transition',
  ]);
  expect((await post(body('READY', 0))).status).toBe(200);
  expect((await post(body('REHEARSAL', 0))).status).toBe(409);
  expect((await post({ ...body('REHEARSAL', 1), eventId: 'another-event' })).status).toBe(400);
  const live = await post({ ...body('REHEARSAL', 1), to: 'LIVE' });
  expect(live.status).toBe(409);
  expect(live.body.error.details.blockers).toContain('go-live:content:missing');
  expect((await state()).status).toBe('READY');
});

it('refuses returning an event observed live to DRAFT, even when an older writer reset its phase', async () => {
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
  await rawDb.event.update({
    where: { id: eventId },
    data: { status: 'READY', hasBeenLive: false, lifecycleVersion: 0 },
  });
  expect(await state()).toMatchObject({ status: 'READY', hasBeenLive: true, lifecycleVersion: 2 });
  const refused = await post(body('DRAFT', 2));
  expect(refused.status).toBe(409);
  expect(refused.body.error.details.blockers).toEqual(['already-live']);
});

it('closes only this event’s open practice windows, retaining counts and live windows', async () => {
  await post(body('READY', 0));
  await post(body('REHEARSAL', 1));
  const practice = await request(app)
    .post(`/api/v1/events/${eventId}/fallback/windows`)
    .set('Authorization', bearer(admin))
    .send({ tier: 4, reason: 'Practice window' });
  expect(practice.status).toBe(201);
  const live = await rawDb.fallbackWindow.create({
    data: {
      eventId,
      rehearsal: false,
      tier: 3,
      startedAt: FROZEN_NOW,
      declaredById: admin.id,
      reason: 'Historical live window',
    },
  });
  const captured = await request(app)
    .post(`/api/v1/events/${eventId}/registrations`)
    .set('Authorization', bearer(admin))
    .send({ stationId, category: 'VISITOR', rehearsal: true, idempotencyKey: idempotencyKey() });
  expect(captured.status).toBe(201);
  expect((await post(body('READY', 2))).status).toBe(200);
  expect(
    await rawDb.fallbackWindow.findUniqueOrThrow({
      where: { eventId, id: practice.body.window.id },
    }),
  ).toMatchObject({ endedAt: FROZEN_NOW, rehearsal: true });
  expect(
    (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId, id: live.id } })).endedAt,
  ).toBeNull();
  expect(await rawDb.registration.count({ where: { eventId, rehearsal: true } })).toBe(1);
  expect(
    (
      await request(app)
        .post(`/api/v1/events/${eventId}/fallback/windows`)
        .set('Authorization', bearer(admin))
        .send({ tier: 4, reason: 'Too late' })
    ).status,
  ).toBe(409);
  const audit = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId, action: 'event.transition', after: { path: ['version'], equals: 3 } },
  });
  expect(audit.after).toMatchObject({
    closedWindows: [practice.body.window.id],
    effects: ['rehearsal.close'],
  });
});

it('serializes competing transitions to one saved version and one audit', async () => {
  const results = await Promise.all([post(body('READY', 0)), post(body('READY', 0))]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await state()).toMatchObject({ status: 'READY', lifecycleVersion: 1 });
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(1);
});

it('rolls back phase, version, audit and window closures if cache publication fails', async () => {
  await post(body('READY', 0));
  await post(body('REHEARSAL', 1));
  const window = await rawDb.fallbackWindow.create({
    data: {
      eventId,
      rehearsal: true,
      tier: 4,
      startedAt: FROZEN_NOW,
      declaredById: admin.id,
      reason: 'Rollback window',
    },
  });
  const publishing = vi
    .spyOn(cacheBus, 'publishCacheEvent')
    .mockRejectedValueOnce(new Error('Publication regression'));
  try {
    expect((await post(body('READY', 2))).status).toBe(500);
  } finally {
    publishing.mockRestore();
  }
  expect(await state()).toMatchObject({ status: 'REHEARSAL', lifecycleVersion: 2 });
  expect(
    (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId, id: window.id } })).endedAt,
  ).toBeNull();
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(2);
});

it('commits retry replay with the transition when middleware bookkeeping fails', async () => {
  const settling = vi
    .spyOn(idempotency, 'settle')
    .mockRejectedValueOnce(new Error('Lost middleware bookkeeping'));
  const requestBody = body('READY', 0);
  try {
    const changed = await post(requestBody);
    expect(changed.status).toBe(200);
    expect((await post(requestBody)).body).toEqual(changed.body);
  } finally {
    settling.mockRestore();
  }
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(1);
});

it('refuses an insufficient role and rechecks permission after the middleware decision', async () => {
  expect((await post(body('READY', 0), volunteer)).status).toBe(403);
  const original = lifecycleRepo.lockLifecycleEvent;
  const check = vi
    .spyOn(lifecycleRepo, 'lockLifecycleEvent')
    .mockImplementationOnce(async (...args) => {
      const row = await original(...args);
      await rawDb.eventMembership.updateMany({
        where: { eventId, personId: admin.id },
        data: { role: 'VOLUNTEER' },
      });
      return row;
    });
  try {
    expect((await post(body('READY', 0))).status).toBe(403);
  } finally {
    check.mockRestore();
  }
  expect((await state()).status).toBe('DRAFT');
});

it('delivers the saved phase/version on the event.state Postgres channel after commit', async () => {
  const listener = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await listener.query('LISTEN "event.state"');
    const notification = new Promise<unknown>((resolve, reject) => {
      listener.once('notification', (message) => resolve(JSON.parse(message.payload!)));
      timer = setTimeout(() => reject(new Error('No event state notification')), 2000);
    });
    expect((await post(body('READY', 0))).status).toBe(200);
    expect(await notification).toEqual({ eventId, status: 'READY', version: 1 });
  } finally {
    clearTimeout(timer);
    await listener.end();
  }
});
