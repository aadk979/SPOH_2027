import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { admitCountCapture } from '../../src/platform/db/countCaptureAdmission.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { changeSetting, resetSetting } from '../../src/platform/settings/change.js';
import { fixedClock } from '../../src/platform/time/index.js';
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
let eventId: string;
let stationId: string;
let otherStationId: string;
let admin: TestVolunteer;
const now = FROZEN_NOW;
const stamp = now.toISOString();
const post = (path: string, body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(admin))
    .send(body);
const registration = (id = stationId) => ({
  stationId: id,
  category: 'SEC_4',
  idempotencyKey: idempotencyKey(),
});
const policyInput = (id?: string) => ({
  target: id
    ? { scope: 'station' as const, eventId, stationId: id }
    : { scope: 'event' as const, eventId },
  key: 'capture.open' as const,
  actorPersonId: admin.id,
  audit: { ...SYSTEM_AUDIT_CONTEXT, actorId: admin.id, eventId },
});
const policy = (value: boolean, id?: string, expectedVersion = 0) =>
  changeSetting({ ...policyInput(id), value, expectedVersion });
const admit = (id?: string) =>
  prisma.$transaction((tx) =>
    admitCountCapture(tx, { eventId }, { stationId: id, clock: fixedClock(now) }),
  );

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'capture-control@test.example', role: 'ADMIN' });
  stationId = (await createStation({ code: 'CONTROL', countsEntry: true, issuesStamp: true })).id;
  otherStationId = (await createStation({ code: 'OPEN', countsEntry: true })).id;
});

function captureRequest(kind: string): [string, object] {
  const envelope = { idempotencyKey: idempotencyKey() };
  const captures: Record<string, [string, object]> = {
    registration: ['/registrations', registration()],
    group: [
      '/registrations/group',
      { ...envelope, stationId, members: [{ category: 'SEC_4', count: 2 }] },
    ],
    tick: ['/footfall/ticks', { ...envelope, stationId }],
    bulk: [
      '/footfall/bulk',
      {
        ...envelope,
        stationId,
        quantity: 2,
        source: 'PAPER',
        timeBlockStart: stamp,
        reason: 'Paper tally',
      },
    ],
    issue: ['/cards/AAA111/issue', envelope],
    stamp: ['/cards/AAA111/stamps', { ...envelope, stationId }],
    gift: ['/gifts/redemptions', { ...envelope, stationId, giftTypeId: 'unused' }],
    registrationsImport: [
      '/fallback/imports/registrations',
      {
        source: 'PAPER',
        commit: true,
        rows: [{ stationCode: 'CONTROL', category: 'SEC_4', count: 1, recordedAt: stamp }],
      },
    ],
    footfallImport: [
      '/fallback/imports/footfall',
      {
        source: 'PAPER',
        commit: true,
        rows: [{ stationCode: 'CONTROL', quantity: 1, timeBlockStart: stamp }],
      },
    ],
  };
  return captures[kind]!;
}

it.each([
  'registration',
  'group',
  'tick',
  'bulk',
  'issue',
  'stamp',
  'gift',
  'registrationsImport',
  'footfallImport',
])('event pause refuses %s before any count or audit effect', async (kind) => {
  await policy(false);
  const before = await rawDb.auditLog.count({ where: { eventId } });
  const [path, body] = captureRequest(kind);
  const response = await post(path, body);
  expect(response.status, JSON.stringify(response.body)).toBe(409);
  expect(response.body.error.message).toContain('paused');
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.footfallTick.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.importBatch.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(before);
});

it.each(['LIVE', 'REHEARSAL'] as const)(
  'station pause isolates counts in %s and resumes immediately',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    await policy(false, stationId);
    expect((await post('/registrations', registration())).status).toBe(409);
    expect((await post('/registrations', registration(otherStationId))).status).toBe(201);
    await policy(true, stationId, 1);
    expect((await post('/registrations', registration())).status).toBe(201);
    const rows = await rawDb.registration.findMany({ where: { eventId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.rehearsal === (status === 'REHEARSAL'))).toBe(true);
  },
);

it('station overrides use the documented precedence without bypassing lifecycle', async () => {
  await policy(false);
  await policy(true, stationId);
  expect((await post('/registrations', registration())).status).toBe(201);
  expect((await post('/registrations', registration(otherStationId))).status).toBe(409);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'READY' } });
  expect((await post('/registrations', registration())).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('a station pause does not disable incident, lost-person or found-item reporting', async () => {
  await policy(false);
  await policy(false, stationId);
  const responses = [
    await post('/incidents', {
      stationId,
      type: 'OTHER',
      severity: 'LOW',
      description: 'Safety remains available',
      occurredAt: stamp,
      idempotencyKey: idempotencyKey(),
    }),
    await post('/lost-person', {
      lastSeenStationId: stationId,
      descriptionText: 'Synthetic safety alert',
      idempotencyKey: idempotencyKey(),
    }),
    await post('/lost-found', { foundStationId: stationId, itemLabel: 'Synthetic item' }),
  ];
  expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
});

it('a mixed-station import rolls back every row if one station is paused; preview stays read-only', async () => {
  await policy(false, stationId);
  const rows = [
    { stationCode: 'OPEN', category: 'SEC_4', count: 2, recordedAt: stamp },
    { stationCode: 'CONTROL', category: 'SEC_4', count: 1, recordedAt: stamp },
  ];
  expect(
    (await post('/fallback/imports/registrations', { source: 'PAPER', commit: false, rows }))
      .status,
  ).toBe(200);
  expect(
    (await post('/fallback/imports/registrations', { source: 'PAPER', commit: true, rows })).status,
  ).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  expect(await rawDb.importBatch.count({ where: { eventId } })).toBe(0);
});

it('completed retries replay through a later pause without accepting a new key', async () => {
  const body = registration();
  const first = await post('/registrations', body);
  expect(first.status).toBe(201);
  await policy(false);
  expect((await post('/registrations', body)).body).toEqual(first.body);
  expect((await post('/registrations', registration())).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('preserves valid pre-close queued captures during CLOSED grace despite a paused policy', async () => {
  await policy(false);
  await policy(false, stationId);
  const closedAt = new Date(now.getTime() - 60_000);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED', closedAt } });
  const body = {
    ...registration(),
    clientRecordedAt: new Date(closedAt.getTime() - 1).toISOString(),
  };
  expect((await post('/registrations', body)).status).toBe(201);
  expect((await post('/registrations', registration())).status).toBe(409);
  expect(
    (await post('/registrations', { ...registration(), clientRecordedAt: closedAt.toISOString() }))
      .status,
  ).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('reset restores inheritance immediately and invalid stored station values fall back to the event', async () => {
  await policy(false, stationId);
  await expect(admit(stationId)).rejects.toMatchObject({ statusCode: 409 });
  await resetSetting({ ...policyInput(stationId), expectedVersion: 1 });
  await expect(admit(stationId)).resolves.toMatchObject({ rehearsal: false });
  await policy(false);
  await rawDb.setting.create({
    data: {
      eventId,
      scope: 'STATION',
      scopeId: stationId,
      key: 'capture.open',
      value: 'invalid',
      version: 3,
    },
  });
  await expect(admit(stationId)).rejects.toMatchObject({ statusCode: 409 });
});

async function waitForEventLock(mode: 'UPDATE' | 'SHARE') {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${`%FROM "Event"%FOR ${mode}%`}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it('a pause waits for an admitted capture to commit, then blocks subsequent captures', async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writing = prisma.$transaction(async (tx) => {
    await admitCountCapture(tx, { eventId }, { stationId, clock: fixedClock(now) });
    entered();
    await gate;
    const category = await tx.captureCategory.findFirstOrThrow({ where: { eventId } });
    await tx.registration.create({
      data: {
        eventId,
        categoryId: category.id,
        stationId,
        recordedById: admin.id,
        idempotencyKey: idempotencyKey(),
      },
    });
  });
  await ready;
  const pausing = policy(false);
  try {
    await waitForEventLock('UPDATE');
    expect(await rawDb.setting.count({ where: { eventId, key: 'capture.open' } })).toBe(0);
  } finally {
    release();
    await Promise.all([writing, pausing]);
  }
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
  expect((await post('/registrations', registration())).status).toBe(409);
});

it('a capture waiting behind a policy write reads the newly committed pause', async () => {
  let outcome: Promise<unknown> | undefined;
  await rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    outcome = admit(stationId).then(
      (value) => value,
      (error) => error,
    );
    await waitForEventLock('SHARE');
    await tx.setting.create({
      data: {
        eventId,
        scope: 'EVENT',
        scopeId: eventId,
        key: 'capture.open',
        value: false,
        version: 1,
      },
    });
  });
  expect(await outcome).toMatchObject({ statusCode: 409 });
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
});
