import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { admitCapture } from '../../src/platform/db/captureAdmission.js';
import { prisma } from '../../src/platform/db/client.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
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
let admin: TestVolunteer;
let volunteer: TestVolunteer;
const closedAt = new Date(FROZEN_NOW.getTime() - 60_000);
const tappedAt = new Date(closedAt.getTime() - 60_000).toISOString();
const post = (path: string, body: object, who = admin) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(who))
    .send(body);
const registration = () => ({ stationId, category: 'SEC_4', idempotencyKey: idempotencyKey() });
const close = () =>
  rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED', closedAt } });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  const day = await createEventDayToday();
  stationId = (await createStation({ code: 'capture', countsEntry: true, issuesStamp: true })).id;
  admin = await createVolunteer({ email: 'admin@admission.test', role: 'ADMIN' });
  volunteer = await createVolunteer({ email: 'volunteer@admission.test', role: 'VOLUNTEER' });
  await assignToStation({ volunteerId: volunteer.id, stationId, eventDayId: day.id });
});

it.each(['DRAFT', 'READY', 'ARCHIVED'] as const)(
  'refuses all new capture surfaces in %s',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    const cases: Array<[string, object]> = [
      ['/registrations', registration()],
      [
        '/registrations/group',
        { stationId, members: [{ category: 'SEC_4', count: 2 }], idempotencyKey: idempotencyKey() },
      ],
      ['/footfall/ticks', { stationId, idempotencyKey: idempotencyKey() }],
      [
        '/footfall/bulk',
        {
          stationId,
          quantity: 4,
          source: 'PAPER',
          timeBlockStart: tappedAt,
          reason: 'Paper tally',
          idempotencyKey: idempotencyKey(),
        },
      ],
      ['/cards/AAA111/issue', { idempotencyKey: idempotencyKey() }],
      ['/cards/AAA111/stamps', { stationId, idempotencyKey: idempotencyKey() }],
      ['/gifts/redemptions', { stationId, giftTypeId: 'unused', idempotencyKey: idempotencyKey() }],
      [
        '/incidents',
        {
          type: 'OTHER',
          severity: 'LOW',
          description: 'Admission test',
          occurredAt: tappedAt,
          idempotencyKey: idempotencyKey(),
        },
      ],
      ['/lost-person', { descriptionText: 'Practice test', idempotencyKey: idempotencyKey() }],
      ['/lost-found', { itemLabel: 'Test item' }],
      [
        '/fallback/imports/registrations',
        {
          source: 'PAPER',
          commit: true,
          rows: [{ stationCode: 'capture', category: 'SEC_4', count: 1, recordedAt: tappedAt }],
        },
      ],
    ];
    for (const [path, body] of cases) {
      const response = await post(path, body);
      expect(response.status, `${path}: ${JSON.stringify(response.body)}`).toBe(409);
    }
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(0);
  },
);

it('accepts a rostered pre-close registration after their shift ends and audits the close exception', async () => {
  await rawDb.shift.updateMany({
    where: { eventId, template: { code: 'MORNING' } },
    data: { endsAt: closedAt },
  });
  await close();
  const body = { ...registration(), rehearsal: false, clientRecordedAt: tappedAt };
  const accepted = await post('/registrations', body, volunteer);
  expect(accepted.status).toBe(201);
  expect((await post('/registrations', body, volunteer)).body).toEqual(accepted.body);
  const saved = await rawDb.registration.findFirstOrThrow({ where: { eventId } });
  expect(saved).toMatchObject({
    rehearsal: false,
    clientRecordedAt: new Date(tappedAt),
    recordedAt: FROZEN_NOW,
  });
  const audit = await rawDb.auditLog.findFirstOrThrow({
    where: { eventId, action: 'registration.create' },
  });
  expect(audit.after).toMatchObject({
    rehearsal: false,
    lateSync: {
      clientRecordedAt: tappedAt,
      closedAt: closedAt.toISOString(),
      receivedAt: FROZEN_NOW.toISOString(),
      graceHours: 24,
    },
  });
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
  expect(
    await rawDb.auditLog.count({ where: { eventId, action: 'auth.stationScopeBypass' } }),
  ).toBe(0);
});

it.each([undefined, closedAt.toISOString(), FROZEN_NOW.toISOString()])(
  'refuses closed capture without a strictly pre-close timestamp: %s',
  async (clientRecordedAt) => {
    await close();
    expect((await post('/registrations', { ...registration(), clientRecordedAt })).status).toBe(
      409,
    );
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  },
);

it('refuses expired grace according to the event setting rather than the default', async () => {
  await rawDb.setting.create({
    data: {
      eventId,
      scope: 'EVENT',
      scopeId: eventId,
      key: 'capture.lateSyncHours',
      value: 1,
      version: 1,
    },
  });
  await rawDb.event.update({
    where: { id: eventId },
    data: { status: 'CLOSED', closedAt: new Date(FROZEN_NOW.getTime() - 2 * 3600_000) },
  });
  const response = await post('/registrations', {
    ...registration(),
    clientRecordedAt: new Date(FROZEN_NOW.getTime() - 3 * 3600_000).toISOString(),
  });
  expect(response.status).toBe(409);
});

it('refuses queued practice after close and a timestamp without a historical assignment', async () => {
  await close();
  expect(
    (
      await post('/registrations', {
        ...registration(),
        rehearsal: true,
        clientRecordedAt: tappedAt,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await post(
        '/registrations',
        {
          ...registration(),
          clientRecordedAt: new Date(FROZEN_NOW.getTime() - 8 * 3600_000).toISOString(),
        },
        volunteer,
      )
    ).status,
  ).toBe(403);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
});

it('admits queued footfall, card issue/stamp, gift redemption and incident writes with close metadata', async () => {
  const gift = await rawDb.giftType.create({
    data: { eventId, name: 'Test gift', initialStock: 4 },
  });
  await rawDb.missionCard.create({
    data: { eventId, shortCode: 'AAA111', qrPayload: 'admission-card', status: 'UNISSUED' },
  });
  await close();
  const envelope = () => ({
    idempotencyKey: idempotencyKey(),
    clientRecordedAt: tappedAt,
    rehearsal: false,
  });
  for (const [path, body] of [
    ['/footfall/ticks', { ...envelope(), stationId }],
    ['/cards/AAA111/issue', envelope()],
    ['/cards/AAA111/stamps', { ...envelope(), stationId }],
    ['/gifts/redemptions', { ...envelope(), stationId, giftTypeId: gift.id, queued: true }],
    [
      '/incidents',
      {
        ...envelope(),
        type: 'OTHER',
        severity: 'LOW',
        description: 'Queued test',
        occurredAt: tappedAt,
      },
    ],
  ] as const) {
    const response = await post(path, body);
    expect(response.status, `${path}: ${JSON.stringify(response.body)}`).toBe(
      path.endsWith('/issue') ? 200 : 201,
    );
  }
  for (const action of [
    'footfall.tick',
    'card.issue',
    'card.stamp',
    'gift.redeem',
    'incident.create',
  ]) {
    expect(
      (await rawDb.auditLog.findFirstOrThrow({ where: { eventId, action } })).after,
    ).toMatchObject({ lateSync: { clientRecordedAt: tappedAt } });
  }
});

it('refuses online-only safety and new imports after close while preserving read/preparation access', async () => {
  await close();
  expect(
    (
      await post('/lost-person', {
        descriptionText: 'Test alert',
        idempotencyKey: idempotencyKey(),
      })
    ).status,
  ).toBe(409);
  expect((await post('/lost-found', { itemLabel: 'Test item' })).status).toBe(409);
  expect(
    (
      await post('/fallback/imports/registrations', {
        source: 'PAPER',
        commit: true,
        rows: [{ stationCode: 'capture', category: 'SEC_4', count: 1, recordedAt: tappedAt }],
      })
    ).status,
  ).toBe(409);
  expect(
    (await request(app).get(`/api/v1/events/${eventId}/gifts`).set('Authorization', bearer(admin)))
      .status,
  ).toBe(200);
});

it('holds close time stable until an admitted transaction commits', async () => {
  await close();
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const capture = prisma.$transaction(async (tx) => {
    await admitCapture(
      tx,
      { eventId },
      { request: { clientRecordedAt: tappedAt }, clock: fixedClock(FROZEN_NOW) },
    );
    entered();
    await releasePromise;
  });
  await enteredPromise;
  let updated = false;
  const transition = rawDb.event
    .update({ where: { id: eventId }, data: { status: 'ARCHIVED' } })
    .then(() => {
      updated = true;
    });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(updated).toBe(false);
  } finally {
    release();
    await Promise.all([capture, transition]);
  }
  expect(updated).toBe(true);
});
