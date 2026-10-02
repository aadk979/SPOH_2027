import request from 'supertest';
import ExcelJS from 'exceljs';
import { beforeEach, expect, it, vi } from 'vitest';
import { FullReport } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as lifecycleRepo from '../../src/modules/event/data/lifecycleRepo.js';
import * as snapshotRepo from '../../src/modules/report/data/snapshotRepo.js';
import * as reminderRepo from '../../src/modules/event/data/archiveReminderRepo.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import * as idempotency from '../../src/platform/idempotency/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const transactionDb = rawDb.$extends({ query: {} });
let eventId: string;
let stationId: string;
let categoryId: string;
let admin: TestVolunteer;
let version: number;
let windowId: string;
let itemId: string;
let fixtureNumber = 0;
const post = (body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send(body);
const closeBody = () => ({
  to: 'CLOSED',
  expectedVersion: version,
  idempotencyKey: idempotencyKey(),
});
const report = (query = '') =>
  request(app)
    .get(`/api/v1/events/${eventId}/reports/summary${query}`)
    .set('Authorization', bearer(admin));
const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
const registrationData = (rehearsal = false) => ({
  eventId,
  stationId,
  categoryId,
  rehearsal,
  recordedById: admin.id,
  recordedAt: FROZEN_NOW,
  idempotencyKey: idempotencyKey(),
});

beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: `admin-${fixtureNumber++}@close.test`, role: 'ADMIN' });
  stationId = (await createStation({ code: 'CLOSE', countsEntry: true })).id;
  categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId, code: 'OTHER' } }))
    .id;
  version = (await state()).lifecycleVersion;
  windowId = (
    await rawDb.fallbackWindow.create({
      data: {
        eventId,
        tier: 4,
        startedAt: new Date(FROZEN_NOW.getTime() - 3600_000),
        declaredById: admin.id,
        reason: 'Close drill',
      },
    })
  ).id;
  itemId = (
    await rawDb.lostFoundItem.create({
      data: { eventId, itemLabel: 'Bottle', foundAt: FROZEN_NOW, loggedById: admin.id },
    })
  ).id;
});

it('commits all close effects, live-only final report, reminder and retry replay together', async () => {
  await rawDb.registration.createMany({ data: [registrationData(), registrationData(true)] });
  const captured = await rawDb.registration.findFirstOrThrow({
    where: { eventId, rehearsal: false },
  });
  await rawDb.visitorRecord.create({
    data: {
      eventId,
      registrationId: captured.id,
      rehearsal: false,
      data: { contact: 'Private visitor value' },
    },
  });
  await rawDb.incident.create({
    data: {
      eventId,
      type: 'OTHER',
      severity: 'LOW',
      occurredAt: FROZEN_NOW,
      description: 'Open incident does not block',
      reportedById: admin.id,
      idempotencyKey: idempotencyKey(),
    },
  });
  await rawDb.lostPersonAlert.create({
    data: { eventId, raisedById: admin.id, descriptionText: 'Private transient description' },
  });
  const future = new Date(FROZEN_NOW.getTime() + 3600_000);
  const futureWindow = await rawDb.fallbackWindow.create({
    data: {
      eventId,
      tier: 3,
      startedAt: future,
      declaredById: admin.id,
      reason: 'Future declaration',
    },
  });
  const practiceWindow = await rawDb.fallbackWindow.create({
    data: {
      eventId,
      tier: 3,
      rehearsal: true,
      startedAt: FROZEN_NOW,
      declaredById: admin.id,
      reason: 'Practice declaration',
    },
  });
  const body = closeBody();
  const closed = await post(body);
  expect(closed.status).toBe(200);
  expect(closed.body.lifecycle).toMatchObject({
    status: 'CLOSED',
    version: version + 1,
    hasBeenLive: true,
  });
  expect(await state()).toMatchObject({ status: 'CLOSED', closedAt: FROZEN_NOW });
  expect((await post(body)).body).toEqual(closed.body);
  expect(
    await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId, id: futureWindow.id } }),
  ).toMatchObject({ endedAt: future });
  expect(
    await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId, id: practiceWindow.id } }),
  ).toMatchObject({ endedAt: FROZEN_NOW });
  expect(
    await rawDb.lostFoundItem.findUniqueOrThrow({ where: { eventId, id: itemId } }),
  ).toMatchObject({ status: 'UNCLAIMED_AT_CLOSE' });
  const snapshots = await rawDb.reportSnapshot.findMany({ where: { eventId } });
  expect(snapshots).toHaveLength(1);
  const snapshot = snapshots[0]!;
  expect(snapshot).toMatchObject({
    kind: 'FINAL',
    lifecycleVersion: version + 1,
    dedupeKey: `final:${version + 1}`,
    rehearsalIncluded: false,
    createdByPersonId: admin.id,
    createdAt: FROZEN_NOW,
  });
  const saved = FullReport.parse(snapshot.report);
  expect(saved.registrations.total).toBe(1);
  expect(saved.rehearsalIncluded).toBe(false);
  expect(saved.event.status).toBe('CLOSED');
  expect(saved.safety.lostAndFound).toMatchObject({ unclaimed: 1 });
  expect(
    saved.dataIntegrity.fallbackWindows.find((row) => row.id === futureWindow.id)?.durationMinutes,
  ).toBe(0);
  expect(JSON.stringify(saved)).not.toContain('Private transient description');
  expect(JSON.stringify(saved)).not.toContain('Private visitor value');
  const reminders = await rawDb.scheduledAction.findMany({
    where: { eventId, type: 'event.archiveReminder' },
  });
  expect(reminders).toHaveLength(1);
  expect(reminders[0]).toMatchObject({
    status: 'PENDING',
    createdByPersonId: null,
    attempts: 0,
    runAt: new Date(FROZEN_NOW.getTime() + 24 * 3600_000),
    payload: { lifecycleVersion: version + 1 },
  });
  const audit = await rawDb.auditLog.findMany({ where: { eventId, action: 'event.transition' } });
  expect(audit).toHaveLength(1);
  expect(audit[0]?.after).toMatchObject({
    action: 'Event.Close',
    closedAt: FROZEN_NOW.toISOString(),
    closedWindows: expect.arrayContaining([windowId, futureWindow.id, practiceWindow.id]),
    closeOut: {
      finalSnapshotId: snapshot.id,
      unclaimedItems: 1,
      archiveReminderId: reminders[0]?.id,
    },
  });
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'lostFound.closeOut' } })).toBe(1);
});

it.each([1, 3, 72])(
  'uses the resolved configured late-sync grace of %i hours for reminder storage',
  async (hours) => {
    await rawDb.setting.create({
      data: {
        eventId,
        scope: 'EVENT',
        scopeId: eventId,
        key: 'capture.lateSyncHours',
        value: hours,
        version: 1,
      },
    });
    expect((await post(closeBody())).status).toBe(200);
    const reminder = await rawDb.scheduledAction.findFirstOrThrow({ where: { eventId } });
    expect(reminder.runAt).toEqual(new Date(FROZEN_NOW.getTime() + hours * 3600_000));
  },
);

it('ignores an invalid grace override and retains the bounded default', async () => {
  await rawDb.setting.create({
    data: {
      eventId,
      scope: 'EVENT',
      scopeId: eventId,
      key: 'capture.lateSyncHours',
      value: -9,
      version: 1,
    },
  });
  expect((await post(closeBody())).status).toBe(200);
  expect((await rawDb.scheduledAction.findFirstOrThrow({ where: { eventId } })).runAt).toEqual(
    new Date(FROZEN_NOW.getTime() + 24 * 3600_000),
  );
});

it.each(['snapshot', 'reminder', 'publication', 'retry settlement'])(
  'rolls back every effect when %s fails, then permits a clean retry',
  async (failure) => {
    const error = new Error('Close-out rollback drill');
    const spy =
      failure === 'snapshot'
        ? vi.spyOn(snapshotRepo, 'saveFinalSnapshot').mockRejectedValueOnce(error)
        : failure === 'reminder'
          ? vi.spyOn(reminderRepo, 'enqueueArchiveReminder').mockRejectedValueOnce(error)
          : failure === 'publication'
            ? vi.spyOn(cacheBus, 'publishCacheEvent').mockRejectedValueOnce(error)
            : vi.spyOn(idempotency, 'settleReserved').mockRejectedValueOnce(error);
    const body = closeBody();
    try {
      expect((await post(body)).status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await state()).toMatchObject({
      status: 'LIVE',
      closedAt: null,
      lifecycleVersion: version,
    });
    expect(
      (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId, id: windowId } })).endedAt,
    ).toBeNull();
    expect(
      (await rawDb.lostFoundItem.findUniqueOrThrow({ where: { eventId, id: itemId } })).status,
    ).toBe('HELD');
    expect(await rawDb.reportSnapshot.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.scheduledAction.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(0);
    expect((await post(body)).status).toBe(200);
  },
);

it('settles the close response atomically even if later middleware bookkeeping fails', async () => {
  const spy = vi
    .spyOn(idempotency, 'settle')
    .mockRejectedValueOnce(new Error('Middleware failure'));
  const body = closeBody();
  try {
    const closed = await post(body);
    expect(closed.status).toBe(200);
    expect((await post(body)).body).toEqual(closed.body);
  } finally {
    spy.mockRestore();
  }
  expect(await rawDb.reportSnapshot.count({ where: { eventId } })).toBe(1);
});

it('serializes competing closes and refuses stale, repeated and illegal transitions', async () => {
  expect((await post({ ...closeBody(), expectedVersion: version + 1 })).status).toBe(409);
  const results = await Promise.all([post(closeBody()), post(closeBody())]);
  expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
  expect((await post({ ...closeBody(), expectedVersion: version + 1 })).status).toBe(409);
  expect(await rawDb.reportSnapshot.count({ where: { eventId } })).toBe(1);
  expect(await rawDb.scheduledAction.count({ where: { eventId } })).toBe(1);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(1);
});

it.each(['role', 'standing'])(
  'rechecks the caller’s current %s before any close effect',
  async (changed) => {
    const original = lifecycleRepo.lockLifecycleEvent;
    const spy = vi
      .spyOn(lifecycleRepo, 'lockLifecycleEvent')
      .mockImplementationOnce(async (...args) => {
        const row = await original(...args);
        await rawDb.eventMembership.updateMany({
          where: { eventId, personId: admin.id },
          data: changed === 'role' ? { role: 'VOLUNTEER' } : { status: 'DEACTIVATED' },
        });
        return row;
      });
    try {
      expect((await post(closeBody())).status).toBe(403);
    } finally {
      spy.mockRestore();
    }
    expect((await state()).status).toBe('LIVE');
    expect(await rawDb.reportSnapshot.count({ where: { eventId } })).toBe(0);
  },
);

it('closes only the path event and refuses a foreign membership', async () => {
  const source = await state();
  const other = await createEvent({
    organisationId: source.organisationId,
    slug: 'other-close',
    name: 'Other close',
    timezone: 'Europe/London',
    status: 'LIVE',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const window = await rawDb.fallbackWindow.create({
    data: {
      eventId: other.id,
      tier: 4,
      startedAt: FROZEN_NOW,
      declaredById: admin.id,
      reason: 'Other window',
    },
  });
  const item = await rawDb.lostFoundItem.create({
    data: {
      eventId: other.id,
      itemLabel: 'Other bottle',
      foundAt: FROZEN_NOW,
      loggedById: admin.id,
    },
  });
  expect(
    (
      await request(app)
        .post(`/api/v1/events/${other.id}/lifecycle`)
        .set('Authorization', bearer(admin))
        .send(closeBody())
    ).status,
  ).toBe(404);
  expect((await post(closeBody())).status).toBe(200);
  expect((await rawDb.event.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('LIVE');
  expect(
    (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { eventId: other.id, id: window.id } }))
      .endedAt,
  ).toBeNull();
  expect(
    (await rawDb.lostFoundItem.findUniqueOrThrow({ where: { eventId: other.id, id: item.id } }))
      .status,
  ).toBe('HELD');
  expect(await rawDb.reportSnapshot.count({ where: { eventId: other.id } })).toBe(0);
  expect(await rawDb.scheduledAction.count({ where: { eventId: other.id } })).toBe(0);
});

it.each(['capture', 'correction'])(
  'waits for an admitted %s and includes its committed result in the final report',
  async (kind) => {
    const existing = await rawDb.registration.create({ data: registrationData() });
    let admitted!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    const permit = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writerPid = 0;
    const writer = transactionDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`;
        writerPid = (await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`)[0]!
          .pid;
        if (kind === 'capture') await tx.registration.create({ data: registrationData() });
        else
          await tx.registration.update({
            where: { eventId, id: existing.id },
            data: { voided: true, voidedReason: 'Concurrent correction' },
          });
        admitted();
        await permit;
      },
      { timeout: 10_000 },
    );
    await ready;
    const closing = post(closeBody()).then((response) => response);
    try {
      await expect
        .poll(
          async () => {
            const rows = await rawDb.$queryRaw<
              Array<{ waiting: boolean }>
            >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${writerPid} = ANY(pg_blocking_pids(pid))) AS waiting`;
            return rows[0]?.waiting;
          },
          { timeout: 3000 },
        )
        .toBe(true);
    } finally {
      release();
    }
    await writer;
    expect((await closing).status).toBe(200);
    const saved = FullReport.parse(
      (await rawDb.reportSnapshot.findFirstOrThrow({ where: { eventId } })).report,
    );
    expect(saved.registrations.total).toBe(kind === 'capture' ? 2 : 0);
    expect(saved.registrations.voided).toBe(kind === 'capture' ? 0 : 1);
  },
);

it('keeps default report and exports frozen through late sync, correction, rename and archive', async () => {
  await rawDb.registration.create({ data: registrationData() });
  expect((await post(closeBody())).status).toBe(200);
  const frozen = await report();
  expect(frozen.status).toBe(200);
  expect(frozen.headers['cache-control']).toBe('no-store');
  expect(frozen.body.snapshot).toMatchObject({
    kind: 'FINAL',
    lifecycleVersion: version + 1,
    createdAt: FROZEN_NOW.toISOString(),
  });
  const late = await request(app)
    .post(`/api/v1/events/${eventId}/registrations`)
    .set('Authorization', bearer(admin))
    .send({
      stationId,
      category: 'OTHER',
      clientRecordedAt: new Date(FROZEN_NOW.getTime() - 1000).toISOString(),
      rehearsal: false,
      idempotencyKey: idempotencyKey(),
    });
  expect(late.status).toBe(201);
  const correction = await request(app)
    .post(`/api/v1/events/${eventId}/registrations/${late.body.registration.id}/void`)
    .set('Authorization', bearer(admin))
    .send({ reason: 'Correct late capture' });
  expect(correction.status).toBe(204);
  await rawDb.registration.create({ data: registrationData(true) });
  await rawDb.station.update({
    where: { eventId, id: stationId },
    data: { name: 'Changed after close' },
  });
  expect((await report()).body).toEqual(frozen.body);
  const current = await report('?current=true');
  expect(current.body.snapshot).toBeUndefined();
  expect(current.body.registrations.voided).toBe(1);
  const practice = await report('?includeRehearsal=true');
  expect(practice.body.registrations.total).toBe(2);
  expect(practice.body.snapshot).toBeUndefined();
  expect((await report(`?from=${FROZEN_NOW.toISOString()}`)).body.snapshot).toBeUndefined();
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect((await report()).body).toEqual(frozen.body);
  const csv = await request(app)
    .get(`/api/v1/events/${eventId}/reports/export?format=csv`)
    .set('Authorization', bearer(admin));
  expect(csv.status).toBe(200);
  expect(csv.headers['content-disposition']).toContain('-frozen-final.csv');
  expect(csv.text).toContain('Frozen final report');
  expect(csv.text).toContain('Late sync and later corrections are excluded.');
  const xlsx = await request(app)
    .get(`/api/v1/events/${eventId}/reports/export?format=xlsx`)
    .set('Authorization', bearer(admin))
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  expect(xlsx.status).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  expect(JSON.stringify(workbook.worksheets[0]?.getSheetValues())).toContain('Frozen final report');
  const currentCsv = await request(app)
    .get(`/api/v1/events/${eventId}/reports/export?format=csv&current=true`)
    .set('Authorization', bearer(admin));
  expect(currentCsv.text).toContain('Current report — includes changes after close');
  expect(currentCsv.headers['content-disposition']).not.toContain('-frozen-final');
});

it('does not silently substitute current results for a missing or invalid frozen report', async () => {
  await rawDb.event.update({
    where: { id: eventId },
    data: { status: 'CLOSED', closedAt: FROZEN_NOW },
  });
  expect((await report()).status).toBe(409);
  expect((await report('?current=true')).status).toBe(200);
  await rawDb.reportSnapshot.create({
    data: {
      eventId,
      kind: 'FINAL',
      lifecycleVersion: version + 1,
      dedupeKey: `final:${version + 1}`,
      report: { unvalidated: true },
    },
  });
  expect((await report()).status).toBe(500);
});

it('keeps active members able to sign in and refresh after close for reports and late sync', async () => {
  const browser = request.agent(app);
  expect((await browser.post('/api/v1/auth/session').send({ email: admin.email })).status).toBe(
    201,
  );
  expect((await post(closeBody())).status).toBe(200);
  const refresh = await browser.post('/api/v1/auth/refresh').send({});
  expect(refresh.status).toBe(200);
  const frozen = await request(app)
    .get(`/api/v1/events/${eventId}/reports/summary`)
    .set('Authorization', `Bearer ${refresh.body.accessToken}`);
  expect(frozen.status).toBe(200);
  expect(frozen.body.snapshot.kind).toBe('FINAL');
  expect(
    (await request(app).post('/api/v1/auth/session').send({ email: admin.email })).status,
  ).toBe(201);
});
