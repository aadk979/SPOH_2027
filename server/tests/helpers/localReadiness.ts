import { randomUUID } from 'node:crypto';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { prisma } from '../../src/platform/db/client.js';
import { requireCurrentPermission } from '../../src/platform/access/currentPermission.js';
import { eventDayAnchor, fixedClock, type Clock } from '../../src/platform/time/index.js';
import { createEvent } from '../../src/modules/event/index.js';
import { addShiftsForDay } from '../../src/modules/eventDays/index.js';
import { lockReadinessEvent } from '../../src/modules/event/data/lifecycleRepo.js';
import { readinessSnapshot } from '../../src/modules/event/data/readinessSnapshotRepo.js';
import { readGoLiveReadiness } from '../../src/modules/event/application/readGoLiveReadiness.js';
import { rawDb } from './db.js';
import { createVolunteer } from './fixtures.js';
import { lifecycleNow, scheduledLifecycleFixture } from './scheduledLifecycle.js';
import { insertContentPublicationFixture } from './content.js';

export async function localReadinessFixture() {
  const f = await scheduledLifecycleFixture();
  const scope = { eventId: f.eventId };
  const day = await rawDb.eventDay.findFirstOrThrow({ where: scope });
  await addShiftsForDay(prisma, scope, { id: day.id, date: '2027-01-07' });
  const shift = await rawDb.shift.findFirstOrThrow({ where: scope });
  const worker = await createVolunteer({
    email: 'readiness-worker@test.example',
    role: 'VOLUNTEER',
  });
  const workerMember = await rawDb.eventMembership.create({
    data: { ...scope, personId: worker.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  const assignment = await rawDb.shiftAssignment.create({
    data: {
      ...scope,
      shiftId: shift.id,
      volunteerId: worker.id,
      membershipId: workerMember.id,
      stationId: f.stationId,
      eventDayId: day.id,
      roleLabel: 'Volunteer',
    },
  });
  const root = await createVolunteer({ email: 'readiness-root@test.example', role: 'ADMIN' });
  const rootMember = await rawDb.eventMembership.create({
    data: { ...scope, personId: root.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  await rawDb.setting.createMany({
    data: [
      {
        ...scope,
        scope: 'EVENT',
        scopeId: f.eventId,
        key: 'attendance.rootMembershipId',
        value: rootMember.id,
        version: 1,
      },
      {
        ...scope,
        scope: 'EVENT',
        scopeId: f.eventId,
        key: 'attendance.campusCidrs',
        value: ['203.0.113.0/24'],
        version: 1,
      },
    ],
  });
  const card = await rawDb.missionCard.create({
    data: {
      ...scope,
      rehearsal: false,
      batchLabel: 'Accepted live batch',
      shortCode: randomUUID(),
      qrPayload: randomUUID(),
    },
  });
  const gift = await rawDb.giftType.create({
    data: { ...scope, name: 'Gift', initialStock: 10, rehearsalInitialStock: 100 },
  });
  const event = await rawDb.event.findUniqueOrThrow({
    where: { id: f.eventId },
    select: { permissionsVersion: true },
  });
  await rawDb.event.update({
    where: { id: f.eventId },
    data: {
      permissionsReviewedVersion: event.permissionsVersion,
      permissionsReviewedAt: lifecycleNow,
    },
  });
  await insertContentPublicationFixture({
    db: rawDb,
    eventId: f.eventId,
    personId: f.creator.id,
    now: lifecycleNow,
  });
  return {
    ...f,
    dayId: day.id,
    shiftId: shift.id,
    worker,
    workerMember,
    assignment,
    root,
    rootMember,
    card,
    gift,
  };
}
export type LocalReadinessFixture = Awaited<ReturnType<typeof localReadinessFixture>>;

/** Separate organisation, colliding event labels/dates, and independently sufficient facts. */
export async function foreignReadinessFixture(f: LocalReadinessFixture) {
  // resetDatabase keeps organisations, so a rerun reuses this one.
  const organisation = await rawDb.organisation.upsert({
    where: { slug: 'foreign-readiness' },
    update: {},
    create: {
      slug: 'foreign-readiness',
      name: 'Other organisation',
      appName: 'Other Ops',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const event = await createEvent({
    organisationId: organisation.id,
    slug: 'timed-lifecycle',
    name: 'Timed lifecycle',
    timezone: 'Asia/Singapore',
    categories: [{ code: 'VISITOR', label: 'Visitor' }],
    stationTypes: [{ code: 'BOOTH', label: 'Booth', registersVisitors: true, countsEntry: true }],
    shiftTemplates: [{ code: 'SHIFT', label: 'Shift', startLocal: '09:00', endLocal: '10:00' }],
  });
  const eventId = event.id;
  const day = await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor('2027-01-07'), label: 'Day' },
  });
  await addShiftsForDay(prisma, { eventId }, { id: day.id, date: '2027-01-07' });
  const shift = await rawDb.shift.findFirstOrThrow({ where: { eventId } });
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId } });
  const station = await rawDb.station.create({
    data: { eventId, typeId: type.id, code: 'BOOTH', name: 'Booth' },
  });
  const root = await rawDb.eventMembership.create({
    data: { eventId, personId: f.root.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  await rawDb.setting.createMany({
    data: [
      {
        eventId,
        scope: 'EVENT',
        scopeId: eventId,
        key: 'attendance.rootMembershipId',
        value: root.id,
        version: 1,
      },
      {
        eventId,
        scope: 'EVENT',
        scopeId: eventId,
        key: 'attendance.campusCidrs',
        value: ['203.0.113.0/24'],
        version: 1,
      },
    ],
  });
  const worker = await rawDb.eventMembership.create({
    data: { eventId, personId: f.worker.id, role: 'VOLUNTEER', status: 'ACTIVE' },
  });
  await rawDb.shiftAssignment.create({
    data: {
      eventId,
      eventDayId: day.id,
      shiftId: shift.id,
      stationId: station.id,
      volunteerId: f.worker.id,
      membershipId: worker.id,
      roleLabel: 'Volunteer',
    },
  });
  const card = await createReadinessCard(eventId, { batchLabel: 'Accepted live batch' });
  const gift = await rawDb.giftType.create({ data: { eventId, name: 'Gift', initialStock: 100 } });
  return {
    eventId,
    organisationId: organisation.id,
    day,
    shift,
    station,
    root,
    worker,
    card,
    gift,
  };
}

/** Mirrors the public read's locks and post-wait clock, without adding a production test hook. */
export function withReadinessObservation<T>(
  f: LocalReadinessFixture,
  observe: (tx: PrismaTransactionClient, now: Date) => Promise<T>,
  clock: Clock = fixedClock(lifecycleNow),
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const scope = { eventId: f.eventId };
      await lockReadinessEvent(tx, scope);
      await requireCurrentPermission(tx, {
        scope,
        personId: f.creator.id,
        membershipId: f.membershipId,
        action: 'Settings.Read',
      });
      return observe(tx, clock.now());
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}

export const readLocalReadiness = (f: LocalReadinessFixture, clock?: Clock) =>
  withReadinessObservation(
    f,
    async (tx, now) => ({
      evaluatedAt: now.toISOString(),
      ...(await readGoLiveReadiness(tx, { scope: { eventId: f.eventId }, now })),
    }),
    clock,
  );

export const readLocalSnapshot = (f: LocalReadinessFixture) =>
  withReadinessObservation(f, (tx) => readinessSnapshot(tx, { eventId: f.eventId }));

export async function createReadinessCard(
  eventId: string,
  input: {
    rehearsal?: boolean;
    status?: 'UNISSUED' | 'ISSUED' | 'COMPLETED' | 'VOIDED' | 'LOST';
    batchLabel?: string | null;
  } = {},
) {
  return rawDb.missionCard.create({
    data: { eventId, shortCode: randomUUID(), qrPayload: randomUUID(), ...input },
  });
}

export async function readinessEffectState(f: LocalReadinessFixture) {
  const eventId = f.eventId;
  return {
    event: await f.state(),
    settings: await rawDb.setting.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    cards: await rawDb.missionCard.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    gifts: await rawDb.giftType.findMany({ where: { eventId }, orderBy: { id: 'asc' } }),
    adjustments: await rawDb.giftStockAdjustment.count({ where: { eventId } }),
    redemptions: await rawDb.giftRedemption.count({ where: { eventId } }),
    audit: await rawDb.auditLog.count(),
    history: await rawDb.settingChange.count(),
    receipts: await rawDb.idempotencyRecord.count(),
    schedules: await rawDb.scheduledAction.count(),
    sessions: await rawDb.refreshSession.count(),
  };
}
