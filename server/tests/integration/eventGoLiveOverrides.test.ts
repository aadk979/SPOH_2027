import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { GO_LIVE_CHECKS } from '../../src/modules/event/domain/lifecycle.js';
import * as snapshot from '../../src/modules/event/application/lifecycleSnapshot.js';
import * as lifecycleRepo from '../../src/modules/event/data/lifecycleRepo.js';
import * as authorityRepo from '../../src/modules/event/data/lifecycleAuthorityRepo.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import { eventDayAnchor } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
const REASON = 'Readiness exception accepted for this supervised rehearsal';
const actualSnapshot = snapshot.lifecycleSnapshot;
let eventId: string;
let organisationId: string;
let admin: TestVolunteer;
let fixtureNumber = 0;
const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
const post = (body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send(body);
const requestBody = () => ({
  to: 'LIVE',
  expectedVersion: 0,
  idempotencyKey: idempotencyKey(),
  goLiveOverrides: [{ code: 'attendance', reason: REASON }],
});
function supplyChecklist(failed = 'attendance') {
  // Only the future readiness producer is substituted; authority, locks, effects and audit are real.
  vi.spyOn(snapshot, 'lifecycleSnapshot').mockImplementation(async (...args) => ({
    ...(await actualSnapshot(...args)),
    goLiveChecks: GO_LIVE_CHECKS.map((code) => ({ code, passed: code !== failed })),
  }));
}

beforeEach(async () => {
  await resetDatabase();
  const source = await testEvent();
  organisationId = (await rawDb.event.findUniqueOrThrow({ where: { id: source.eventId } }))
    .organisationId;
  admin = await createVolunteer({ email: `admin-${fixtureNumber++}@go-live.test`, role: 'ADMIN' });
  const event = await createEvent({
    organisationId,
    slug: 'go-live',
    name: 'Go-live test',
    timezone: 'Asia/Singapore',
    status: 'READY',
    categories: [{ code: 'VISITOR', label: 'Visitor' }],
    stationTypes: [{ code: 'BOOTH', label: 'Booth', registersVisitors: true }],
    shiftTemplates: [{ code: 'SHIFT', label: 'Shift', startLocal: '09:00', endLocal: '10:00' }],
  });
  eventId = event.id;
  await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor('2027-01-07'), label: 'Day' },
  });
  await rawDb.eventMembership.create({
    data: { eventId, personId: admin.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  await rawDb.organisationMembership.create({
    data: { organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

it('refuses first go-live and all overrides while the real checklist is unavailable', async () => {
  const response = await post(requestBody());
  expect(response.status).toBe(409);
  expect(response.body.error.details.blockers).toContain('go-live:content:missing');
  expect(await state()).toMatchObject({ status: 'READY', hasBeenLive: false, lifecycleVersion: 0 });
});

it('audits the server results and per-item reason with the atomic transition and replay', async () => {
  supplyChecklist();
  const body = requestBody();
  const response = await post(body);
  expect(response.status).toBe(200);
  expect((await post(body)).body).toEqual(response.body);
  expect(await state()).toMatchObject({ status: 'LIVE', hasBeenLive: true, lifecycleVersion: 1 });
  const rows = await rawDb.auditLog.findMany({ where: { eventId, action: 'event.transition' } });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.after).toMatchObject({
    action: 'Event.GoLive',
    guardResults: {
      goLiveChecks: GO_LIVE_CHECKS.map((code) => ({ code, passed: code !== 'attendance' })),
      goLiveOverrides: [{ code: 'attendance', reason: REASON }],
    },
  });
});

it.each(['absent', 'member', 'foreign organisation'])(
  'cannot use %s authority for an override',
  async (kind) => {
    supplyChecklist();
    await rawDb.organisationMembership.deleteMany({
      where: { organisationId, personId: admin.id },
    });
    if (kind === 'member')
      await rawDb.organisationMembership.create({ data: { organisationId, personId: admin.id } });
    if (kind === 'foreign organisation') {
      const other = await rawDb.organisation.upsert({
        where: { slug: 'foreign-go-live' },
        update: {},
        create: {
          slug: 'foreign-go-live',
          name: 'Other organisation',
          appName: 'Other Ops',
          defaultTimezone: 'Europe/London',
        },
      });
      await rawDb.organisationMembership.create({
        data: { organisationId: other.id, personId: admin.id, role: 'PLATFORM_ADMIN' },
      });
    }
    const result = await post(requestBody());
    expect(result.status).toBe(409);
    expect(result.body.error.details.blockers).toContain('platform-admin-required');
    expect((await state()).status).toBe('READY');
  },
);

it('does not require platform authority when all computed checks pass without overrides', async () => {
  supplyChecklist('none');
  await rawDb.organisationMembership.deleteMany({ where: { organisationId, personId: admin.id } });
  const { goLiveOverrides: _overrides, ...body } = requestBody();
  expect((await post(body)).status).toBe(200);
});

it.each(['organisation role', 'event role', 'event status'])(
  'rechecks %s after the exclusive event lock',
  async (kind) => {
    supplyChecklist();
    const original = lifecycleRepo.lockLifecycleEvent;
    vi.spyOn(lifecycleRepo, 'lockLifecycleEvent').mockImplementationOnce(async (...args) => {
      const event = await original(...args);
      if (kind === 'organisation role')
        await rawDb.organisationMembership.updateMany({
          where: { organisationId, personId: admin.id },
          data: { role: 'MEMBER' },
        });
      else
        await rawDb.eventMembership.updateMany({
          where: { eventId, personId: admin.id },
          data: kind === 'event role' ? { role: 'VOLUNTEER' } : { status: 'DEACTIVATED' },
        });
      return event;
    });
    expect((await post(requestBody())).status).toBe(kind === 'organisation role' ? 409 : 403);
    expect((await state()).status).toBe('READY');
  },
);

it('holds organisation authority until the override transaction commits', async () => {
  supplyChecklist();
  const original = authorityRepo.currentOrganisationRole;
  let writer: Promise<unknown> | undefined;
  vi.spyOn(authorityRepo, 'currentOrganisationRole').mockImplementationOnce(async (...args) => {
    const member = await original(...args);
    let writerPid = 0;
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    writer = rawDb.$transaction(async (tx) => {
      writerPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!
        .pid;
      ready();
      await tx.organisationMembership.updateMany({
        where: { organisationId, personId: admin.id },
        data: { role: 'MEMBER' },
      });
    });
    await started;
    await expect
      .poll(async () => {
        const rows = await rawDb.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT cardinality(pg_blocking_pids(${writerPid})) > 0 AS waiting`;
        return rows[0]?.waiting;
      })
      .toBe(true);
    return member;
  });
  try {
    expect((await post(requestBody())).status).toBe(200);
  } finally {
    vi.restoreAllMocks();
    await writer;
  }
  expect((await state()).status).toBe('LIVE');
});

it('rolls back phase and audit when publication fails and permits a clean retry', async () => {
  supplyChecklist();
  vi.spyOn(cacheBus, 'publishCacheEvent').mockRejectedValueOnce(
    new Error('Go-live rollback drill'),
  );
  const body = requestBody();
  expect((await post(body)).status).toBe(500);
  expect(await state()).toMatchObject({ status: 'READY', lifecycleVersion: 0, hasBeenLive: false });
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(0);
  expect((await post(body)).status).toBe(200);
});
