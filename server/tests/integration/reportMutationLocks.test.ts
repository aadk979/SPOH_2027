import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { voidRegistrationById } from '../../src/modules/registration/application/voidRegistrationById.js';
import { voidTickById } from '../../src/modules/footfall/application/voidTickById.js';
import * as registrationRepo from '../../src/modules/registration/data/repo.js';
import { voidCard } from '../../src/modules/missionCard/application/voidCard.js';
import { generateBatch } from '../../src/modules/missionCard/application/generateBatch.js';
import { changeIncidentStatus } from '../../src/modules/incident/application/changeIncidentStatus.js';
import { appendFollowUp } from '../../src/modules/incident/application/appendFollowUp.js';
import { acknowledge } from '../../src/modules/lostPerson/application/acknowledge.js';
import { resolve } from '../../src/modules/lostPerson/application/resolve.js';
import { claimItem } from '../../src/modules/lostFound/application/claimItem.js';
import { markUnclaimedAtClose } from '../../src/modules/lostFound/application/markUnclaimedAtClose.js';
import { closeFallback } from '../../src/modules/fallback/application/closeFallback.js';
import { createGiftType } from '../../src/modules/gift/application/createGiftType.js';
import { updateGiftType } from '../../src/modules/gift/application/updateGiftType.js';
import { generateReportInTransaction } from '../../src/modules/report/index.js';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
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
const transactionDb = rawDb.$extends({ query: {} });
let eventId: string;
let admin: TestVolunteer;
let actor: ActorContext;
let registrationId: string;
let tickId: string;
let incidentId: string;
let alertId: string;
let itemId: string;
let windowId: string;
let giftId: string;
let batchKey: string;

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'mutation-lock@test.invalid', role: 'ADMIN' });
  const member = await rawDb.eventMembership.findFirstOrThrow({
    where: { eventId, personId: admin.id },
  });
  actor = {
    scope: { eventId },
    volunteerId: admin.id,
    membershipId: member.id,
    audit: {
      eventId,
      actorId: admin.id,
      actorSub: admin.sub,
      membershipId: member.id,
      ip: null,
      userAgent: null,
      requestId: null,
    },
  };
  const stationId = (await createStation({ code: 'CORRECTION', countsEntry: true })).id;
  const categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } })).id;
  registrationId = (
    await rawDb.registration.create({
      data: {
        eventId,
        stationId,
        categoryId,
        recordedById: admin.id,
        recordedByMembershipId: member.id,
        idempotencyKey: idempotencyKey(),
      },
    })
  ).id;
  tickId = (
    await rawDb.footfallTick.create({
      data: {
        eventId,
        stationId,
        recordedById: admin.id,
        recordedByMembershipId: member.id,
        idempotencyKey: idempotencyKey(),
      },
    })
  ).id;
  await rawDb.missionCard.create({
    data: {
      eventId,
      shortCode: 'A2B3C4',
      qrPayload: 'lock-card',
      status: 'ISSUED',
      issuedAt: FROZEN_NOW,
    },
  });
  incidentId = (
    await rawDb.incident.create({
      data: {
        eventId,
        type: 'OTHER',
        severity: 'LOW',
        reportedById: admin.id,
        occurredAt: FROZEN_NOW,
        description: 'Lock drill',
        idempotencyKey: idempotencyKey(),
      },
    })
  ).id;
  alertId = (
    await rawDb.lostPersonAlert.create({
      data: { eventId, descriptionText: 'Lock drill', raisedById: admin.id },
    })
  ).id;
  itemId = (
    await rawDb.lostFoundItem.create({
      data: { eventId, itemLabel: 'Lock drill', foundAt: FROZEN_NOW, loggedById: admin.id },
    })
  ).id;
  windowId = (
    await rawDb.fallbackWindow.create({
      data: {
        eventId,
        tier: 4,
        startedAt: FROZEN_NOW,
        declaredById: admin.id,
        reason: 'Lock drill',
      },
    })
  ).id;
  giftId = (await rawDb.giftType.create({ data: { eventId, name: 'Lock gift', initialStock: 10 } }))
    .id;
  batchKey = idempotencyKey();
  await rawDb.idempotencyRecord.create({
    data: {
      key: batchKey,
      eventId,
      actorSub: admin.sub,
      endpoint: 'POST /cards/batch',
      statusCode: 0,
      responseBody: {},
    },
  });
});

const corrections = [
  [
    'registration void',
    () => voidRegistrationById(registrationId, 'Correction', actor),
    'registration.void',
  ],
  ['footfall void', () => voidTickById(tickId, 'Correction', actor), 'footfall.void'],
  ['card void', () => voidCard('A2B3C4', 'Correction', actor), 'card.void'],
  [
    'card batch',
    () =>
      generateBatch(
        { idempotencyKey: batchKey, count: 1, batchLabel: 'Lock drill', rehearsal: false },
        actor,
      ),
    'card.batch',
  ],
  [
    'incident status',
    () => changeIncidentStatus(incidentId, { status: 'RESOLVED', note: 'Correction' }, actor),
    'incident.statusChange',
  ],
  [
    'incident follow-up',
    () => appendFollowUp(incidentId, { note: 'Correction' }, actor),
    'incident.followUp',
  ],
  ['lost-person acknowledgement', () => acknowledge(alertId, actor), 'lostPerson.acknowledge'],
  [
    'lost-person resolution',
    () => resolve(alertId, { outcome: 'RESOLVED_FOUND' }, actor),
    'lostPerson.resolve',
  ],
  ['found-item claim', () => claimItem(itemId, {}, actor), 'lostFound.claim'],
  ['found-item close-out', () => markUnclaimedAtClose(actor), 'lostFound.closeOut'],
  ['fallback close', () => closeFallback(windowId, {}, actor), 'fallback.close'],
  [
    'gift creation',
    () => createGiftType({ name: 'New gift', initialStock: 4, lowStockThreshold: 1 }, actor),
    'giftType.create',
  ],
  ['gift update', () => updateGiftType(giftId, { name: 'Renamed gift' }, actor), 'giftType.update'],
] as const;

async function eventLockWaiters() {
  const rows = await rawDb.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
      AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR SHARE%'`;
  return Number(rows[0]?.count ?? 0);
}

it.each(corrections)(
  '%s waits for the lifecycle lock before changing a report input',
  async (_name, correct, action) => {
    let unlock!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const transition = rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      entered();
      await release;
    });
    await ready;
    const correction = correct();
    try {
      await expect.poll(eventLockWaiters, { timeout: 2000 }).toBe(1);
      expect(await rawDb.auditLog.count({ where: { eventId, action } })).toBe(0);
    } finally {
      unlock();
      await transition;
      await correction;
    }
    expect(await rawDb.auditLog.count({ where: { eventId, action } })).toBe(1);
  },
);

it.each(['registration', 'footfall'] as const)(
  'serializes concurrent %s voids into one correction and one audit',
  async (kind) => {
    const path =
      kind === 'registration'
        ? `/registrations/${registrationId}/void`
        : `/footfall/ticks/${tickId}/void`;
    const results = await Promise.all(
      [1, 2].map((n) =>
        request(app)
          .post(`/api/v1/events/${eventId}${path}`)
          .set('Authorization', bearer(admin))
          .send({ reason: `Correction ${n}` }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(
      await rawDb.auditLog.count({
        where: { eventId, action: kind === 'registration' ? 'registration.void' : 'footfall.void' },
      }),
    ).toBe(1);
  },
);

it('a close waiting for a correction includes its committed result in every report section', async () => {
  let unlock!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const original = registrationRepo.voidRegistration;
  vi.spyOn(registrationRepo, 'voidRegistration').mockImplementation(async (...args) => {
    entered();
    await release;
    return original(...args);
  });
  const correction = voidRegistrationById(registrationId, 'Correction before close', actor);
  await ready;
  let closed = false;
  const close = transactionDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    await tx.event.update({
      where: { id: eventId },
      data: { status: 'CLOSED', closedAt: FROZEN_NOW },
    });
    const report = await generateReportInTransaction(tx, { eventId }, { query: {} });
    closed = true;
    return report;
  });
  try {
    await expect
      .poll(
        async () => {
          const rows = await rawDb.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
          return Number(rows[0]?.count ?? 0);
        },
        { timeout: 2000 },
      )
      .toBe(1);
    expect(closed).toBe(false);
  } finally {
    unlock();
    await correction;
    vi.restoreAllMocks();
  }
  const report = await close;
  expect(report.registrations).toMatchObject({ total: 0, voided: 1 });
  expect(report.dataIntegrity.voidedRecords).toContainEqual({ table: 'Registration', value: 1 });
  expect(report.event.status).toBe('CLOSED');
});

it('card void and found-item claim use their injected receipt clock', async () => {
  const now = new Date(FROZEN_NOW.getTime() + 123_000);
  const timedActor = { ...actor, clock: fixedClock(now) };
  await voidCard('A2B3C4', 'Timed correction', timedActor);
  await claimItem(itemId, {}, timedActor);
  expect(
    (await rawDb.missionCard.findFirstOrThrow({ where: { eventId, shortCode: 'A2B3C4' } }))
      .voidedAt,
  ).toEqual(now);
  expect(
    (await rawDb.lostFoundItem.findFirstOrThrow({ where: { eventId, id: itemId } })).claimedAt,
  ).toEqual(now);
});
