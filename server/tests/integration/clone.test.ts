import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { applyClone, planClone } from '../../src/modules/event/index.js';
import type { AuditContext } from '../../src/platform/audit/index.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * P09.9: cloning an event's structure into a new event (ADR-001 §6, "How it
 * is tested" 4). The source is the test event with a day, stations, a gift
 * type, people and some operations; the clone is a year later.
 */

const SYSTEM: AuditContext = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: null,
};

const YEAR = 365;
let app: Express;
let source: EventScope;
let volunteer: TestVolunteer;
let ic: TestVolunteer;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  source = await testEvent();
  const dayId = (await createEventDayToday()).id;
  const stationId = (await createStation({ code: 'DESK', name: 'Desk' })).id;
  await createStation({ code: 'ROOM', name: 'Room', countsEntry: true });
  volunteer = await createVolunteer({ email: 'v@clone.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@clone.test', role: 'IC' });
  await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId, eventDayId: dayId });
  const icMembership = await rawDb.eventMembership.findUniqueOrThrow({
    where: { eventId_personId: { eventId: source.eventId, personId: ic.id } },
  });
  await rawDb.eventMembership.update({
    where: { eventId_personId: { eventId: source.eventId, personId: volunteer.id } },
    data: { reportsToId: icMembership.id },
  });
  await rawDb.giftType.create({
    data: { eventId: source.eventId, name: 'Tote', initialStock: 100 },
  });
  // Operations, which must not come along.
  const category = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId: source.eventId, code: 'SEC_1' },
  });
  await rawDb.registration.create({
    data: {
      eventId: source.eventId,
      category: 'SEC_1',
      categoryId: category.id,
      stationId,
      recordedById: volunteer.id,
      idempotencyKey: idempotencyKey(),
    },
  });
});

const request2028 = (inviteSamePeople = false) => ({
  slug: 'spoh-2028',
  name: 'SPOH 2028',
  dayOffsetDays: YEAR,
  inviteSamePeople,
});

async function countsIn(eventId: string) {
  const where = { eventId };
  return {
    categories: await rawDb.captureCategory.count({ where }),
    stationTypes: await rawDb.stationType.count({ where }),
    stations: await rawDb.station.count({ where }),
    shiftTemplates: await rawDb.shiftTemplate.count({ where }),
    days: await rawDb.eventDay.count({ where }),
    shifts: await rawDb.shift.count({ where }),
    giftTypes: await rawDb.giftType.count({ where }),
  };
}

describe('cloning an event (P09.9)', () => {
  it('plans what it will create, and names what stops it', async () => {
    const plan = await planClone(source, request2028());
    expect(plan.counts).toMatchObject({ ...(await countsIn(source.eventId)), memberships: 0 });
    expect(plan.days).toEqual([{ from: '2027-01-07', to: '2028-01-07', label: 'Test Day' }]);
    expect(plan.conflicts).toEqual([]);

    const clash = await planClone(source, { ...request2028(), slug: 'test-event' });
    expect(clash.conflicts).toHaveLength(1);
    await expect(applyClone(clash, { audit: SYSTEM })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('copies the structure into a DRAFT event, with no operations and no shared ids', async () => {
    const event = await applyClone(await planClone(source, request2028()), { audit: SYSTEM });

    expect(event).toMatchObject({ status: 'DRAFT', clonedFromEventId: source.eventId });
    expect(await countsIn(event.id)).toEqual(await countsIn(source.eventId));
    const operations = { eventId: event.id };
    expect(await rawDb.registration.count({ where: operations })).toBe(0);
    expect(await rawDb.shiftAssignment.count({ where: operations })).toBe(0);
    expect(await rawDb.eventMembership.count({ where: operations })).toBe(0);
    expect(await rawDb.giftRedemption.count({ where: operations })).toBe(0);

    const ids = async (eventId: string) =>
      new Set([
        ...(await rawDb.station.findMany({ where: { eventId } })).map((row) => row.id),
        ...(await rawDb.eventDay.findMany({ where: { eventId } })).map((row) => row.id),
        ...(await rawDb.stationType.findMany({ where: { eventId } })).map((row) => row.id),
      ]);
    const sourceIds = await ids(source.eventId);
    for (const id of await ids(event.id)) expect(sourceIds.has(id)).toBe(false);

    const audit = await rawDb.auditLog.findMany({ where: { action: 'event.clone' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(event.id);
  });

  it('moves days by the offset and keeps shifts at the same wall-clock times', async () => {
    const event = await applyClone(await planClone(source, request2028()), { audit: SYSTEM });

    const day = await rawDb.eventDay.findFirstOrThrow({ where: { eventId: event.id } });
    expect(day.date.toISOString()).toBe('2028-01-07T00:00:00.000Z');
    const shifts = await rawDb.shift.findMany({
      where: { eventId: event.id },
      include: { template: true },
      orderBy: { startsAt: 'asc' },
    });
    // 09:30 and 13:30 Singapore on 7 Jan 2028.
    expect(shifts.map((shift) => shift.startsAt.toISOString())).toEqual([
      '2028-01-07T01:30:00.000Z',
      '2028-01-07T05:30:00.000Z',
    ]);
    // Every shift points at the new event's day and templates.
    for (const shift of shifts) {
      expect(shift.eventDayId).toBe(day.id);
      expect(shift.template.eventId).toBe(event.id);
    }
    const stations = await rawDb.station.findMany({
      where: { eventId: event.id },
      include: { type: true },
    });
    expect(stations.map((station) => station.code).sort()).toEqual(['DESK', 'ROOM']);
    for (const station of stations) expect(station.type?.eventId).toBe(event.id);
  });

  it('resets gift stock: the type comes along, its redemptions and adjustments do not', async () => {
    const event = await applyClone(await planClone(source, request2028()), { audit: SYSTEM });
    const [tote] = await rawDb.giftType.findMany({ where: { eventId: event.id } });
    expect(tote).toMatchObject({ name: 'Tote', initialStock: 100 });
    expect(await rawDb.giftStockAdjustment.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('invites the same people when asked, with reporting lines inside the new event', async () => {
    const event = await applyClone(await planClone(source, request2028(true)), { audit: SYSTEM });

    const memberships = await rawDb.eventMembership.findMany({ where: { eventId: event.id } });
    expect(memberships.map((row) => row.status)).toEqual(['INVITED', 'INVITED']);
    const byPerson = new Map(memberships.map((row) => [row.personId, row]));
    const copiedIc = byPerson.get(ic.id);
    expect(copiedIc?.role).toBe('IC');
    expect(byPerson.get(volunteer.id)?.reportsToId).toBe(copiedIc?.id);
  });

  it('gives a working, empty event', async () => {
    const event = await applyClone(await planClone(source, request2028(true)), { audit: SYSTEM });
    // An invited person can work in it once they accept (P12); accept one here.
    await rawDb.eventMembership.update({
      where: { eventId_personId: { eventId: event.id, personId: ic.id } },
      data: { status: 'ACTIVE' },
    });

    const stations = await request(app)
      .get(`/api/v1/events/${event.id}/stations`)
      .set('Authorization', bearer(ic));
    expect(stations.status).toBe(200);
    expect(stations.body.data.map((station: { code: string }) => station.code).sort()).toEqual([
      'DESK',
      'ROOM',
    ]);
    const me = await request(app)
      .get(`/api/v1/events/${event.id}/me`)
      .set('Authorization', bearer(ic));
    expect(me.body.event).toMatchObject({ id: event.id, name: 'SPOH 2028' });
    expect(me.body.upcomingAssignments).toEqual([]);
    const inbox = await request(app)
      .get(`/api/v1/events/${event.id}/announcements`)
      .set('Authorization', bearer(ic));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data).toEqual([]);
  });

  it('reports and dashboards a cloned event with its own labels and only its numbers (P09.12)', async () => {
    const event = await applyClone(await planClone(source, request2028(true)), { audit: SYSTEM });
    await rawDb.eventMembership.update({
      where: { eventId_personId: { eventId: event.id, personId: ic.id } },
      data: { status: 'ACTIVE', role: 'ADMIN' },
    });
    // The new event renames a category: labels are its own data, not a code's.
    const renamed = await rawDb.captureCategory.update({
      where: { eventId_code: { eventId: event.id, code: 'SEC_1' } },
      data: { label: 'Year 1' },
    });
    const desk = await rawDb.station.findUniqueOrThrow({
      where: { eventId_code: { eventId: event.id, code: 'DESK' } },
    });
    for (let index = 0; index < 2; index += 1) {
      await rawDb.registration.create({
        data: {
          eventId: event.id,
          category: 'SEC_1',
          categoryId: renamed.id,
          stationId: desk.id,
          recordedById: ic.id,
          idempotencyKey: idempotencyKey(),
        },
      });
    }

    const report = await request(app)
      .get(`/api/v1/events/${event.id}/reports/summary`)
      .set('Authorization', bearer(ic));
    expect(report.status).toBe(200);
    expect(report.body.event).toMatchObject({ name: 'SPOH 2028', status: 'DRAFT' });
    expect(report.body.registrations.total).toBe(2);
    expect(report.body.registrations.byCategory).toEqual([
      { key: 'SEC_1', label: 'Year 1', value: 2 },
    ]);

    const live = await request(app)
      .get(`/api/v1/events/${event.id}/dashboard/live`)
      .set('Authorization', bearer(ic));
    expect(live.status).toBe(200);
    expect(live.body.registrations.byCategory).toEqual([
      { key: 'SEC_1', label: 'Year 1', value: 2 },
    ]);

    // The source still reports its own one registration, under its own label.
    const sourceReport = await request(app)
      .get(`/api/v1/events/${source.eventId}/reports/summary`)
      .set(
        'Authorization',
        bearer(await createVolunteer({ email: 'admin@clone.test', role: 'ADMIN' })),
      );
    expect(sourceReport.body.registrations.byCategory).toEqual([
      { key: 'SEC_1', label: 'Sec 1', value: 1 },
    ]);
  });
});
