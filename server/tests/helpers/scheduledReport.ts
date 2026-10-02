import { randomUUID } from 'node:crypto';
import { previousDate, zonedDayWindow } from '@spoh/shared';
import { reportScheduledHandlers } from '../../src/modules/report/index.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { eventDateOf, eventDayAnchor, fixedClock } from '../../src/platform/time/index.js';
import { rawDb } from './db.js';
import { createStation, createVolunteer, testEvent } from './fixtures.js';
import { FROZEN_NOW } from '../setup.js';

export const reportRegistry = new HandlerRegistry(reportScheduledHandlers);
export const reportNow = FROZEN_NOW;
export const reportAt = (offset: number) => new Date(reportNow.getTime() + offset);

export async function scheduledReportFixture() {
  const { eventId } = await testEvent();
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const date = previousDate(eventDateOf(reportNow, event));
  const day = await rawDb.eventDay.create({
    data: { eventId, date: eventDayAnchor(date), label: 'Finished day' },
  });
  const { start, end } = zonedDayWindow(date, event.timezone, event.dayBoundaryMinutes);
  const creator = await createVolunteer({ email: 'timed-report@test.example', role: 'LEAD' });
  const membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: creator.id } })
  ).id;
  const station = await createStation({ code: 'TIMED-REPORT', countsEntry: true });
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } });
  const create = (payload = {}, data = {}) =>
    rawDb.scheduledAction.create({
      data: {
        eventId,
        type: 'report.snapshot',
        payload: { kind: 'daily', eventDayId: day.id, ...payload },
        runAt: reportNow,
        createdByPersonId: creator.id,
        ...data,
      },
    });
  const action = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
  const claims = (instant = reportNow) =>
    claimDueActions({
      workerId: 'report-worker',
      types: reportRegistry.types(),
      clock: fixedClock(instant),
    });
  const run = async (instant = reportNow) =>
    runClaimedAction({
      claim: (await claims(instant))[0]!,
      registry: reportRegistry,
      clock: fixedClock(instant),
    });
  const snapshots = () => rawDb.reportSnapshot.findMany({ where: { eventId, kind: 'DAILY' } });
  const receipts = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
  const registration = (rehearsal = false, recordedAt = start) =>
    rawDb.registration.create({
      data: {
        eventId,
        stationId: station.id,
        categoryId: category.id,
        rehearsal,
        recordedAt,
        recordedById: creator.id,
        idempotencyKey: randomUUID(),
      },
    });
  return {
    eventId,
    dayId: day.id,
    date,
    start,
    end,
    creator,
    membershipId,
    stationId: station.id,
    categoryId: category.id,
    create,
    action,
    claims,
    run,
    snapshots,
    receipts,
    registration,
  };
}
export type ScheduledReportFixture = Awaited<ReturnType<typeof scheduledReportFixture>>;
