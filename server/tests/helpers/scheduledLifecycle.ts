import { expect } from 'vitest';
import { createEvent, eventScheduledHandlers } from '../../src/modules/event/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { eventDayAnchor, fixedClock } from '../../src/platform/time/index.js';
import { rawDb } from './db.js';
import { createVolunteer, testEvent } from './fixtures.js';
import { FROZEN_NOW } from '../setup.js';

export const lifecycleRegistry = new HandlerRegistry(eventScheduledHandlers);
export const lifecycleNow = FROZEN_NOW;
export const lifecycleAt = (offset: number) => new Date(lifecycleNow.getTime() + offset);

export async function scheduledLifecycleFixture() {
  const source = await testEvent();
  const { organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: source.eventId } });
  const creator = await createVolunteer({ email: 'timed-lifecycle@test.example', role: 'ADMIN' });
  const event = await createEvent({
    organisationId,
    slug: 'timed-lifecycle',
    name: 'Timed lifecycle',
    timezone: 'Asia/Singapore',
    categories: [{ code: 'VISITOR', label: 'Visitor' }],
    stationTypes: [{ code: 'BOOTH', label: 'Booth', registersVisitors: true, countsEntry: true }],
    shiftTemplates: [{ code: 'SHIFT', label: 'Shift', startLocal: '09:00', endLocal: '10:00' }],
  });
  const eventId = event.id;
  const member = await rawDb.eventMembership.create({
    data: { eventId, personId: creator.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor('2027-01-07'), label: 'Day' },
  });
  const type = await rawDb.stationType.findFirstOrThrow({ where: { eventId } });
  const station = await rawDb.station.create({
    data: { eventId, typeId: type.id, code: 'BOOTH', name: 'Booth' },
  });
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } });
  const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const action = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
  const claims = (instant = lifecycleNow) =>
    claimDueActions({
      workerId: 'lifecycle-worker',
      types: lifecycleRegistry.types(),
      clock: fixedClock(instant),
    });
  const run = async (instant = lifecycleNow) =>
    runClaimedAction({
      claim: (await claims(instant))[0]!,
      registry: lifecycleRegistry,
      clock: fixedClock(instant),
    });
  const create = async (payload: object, data = {}) =>
    rawDb.scheduledAction.create({
      data: {
        eventId,
        type: 'event.transition',
        payload: { expectedVersion: (await state()).lifecycleVersion, ...payload },
        runAt: lifecycleNow,
        createdByPersonId: creator.id,
        ...data,
      },
    });
  const window = (rehearsal = false) =>
    rawDb.fallbackWindow.create({
      data: {
        eventId,
        rehearsal,
        tier: 4,
        startedAt: lifecycleNow,
        declaredById: creator.id,
        reason: 'Synthetic timed transition',
      },
    });
  const receipts = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
  return {
    eventId,
    organisationId,
    creator,
    membershipId: member.id,
    stationId: station.id,
    categoryId: category.id,
    state,
    action,
    claims,
    run,
    create,
    window,
    receipts,
  };
}
export type ScheduledLifecycleFixture = Awaited<ReturnType<typeof scheduledLifecycleFixture>>;

export async function waitForLifecycleLock() {
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FROM "Event"%FOR UPDATE%'`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}
