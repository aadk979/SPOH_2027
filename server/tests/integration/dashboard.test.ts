import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { SILENT_STATION_MINUTES } from '../../src/modules/footfall/index.js';
import { resetDatabase, rawDb } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
  testEvent,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * The live dashboard and data health.
 *
 * The Phase 3 acceptance criteria are asserted here directly: the dashboard
 * reflects a capture immediately, and a silent station is flagged within
 * fifteen minutes.
 */

let app: Express;
let counter: TestVolunteer;
let booth: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let boothStationId: string;
let roomAId: string;
let eventDayId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  eventDayId = eventDay.id;

  boothStationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;
  roomAId = (await createStation({ code: 'ROOM_A', name: 'Room A', countsEntry: true })).id;
  // Room B exists but is never counted at, so it is the station that should
  // show up as silent. Its id is never needed — only its absence from the data.
  await createStation({ code: 'ROOM_B', name: 'Room B', countsEntry: true });

  booth = await createVolunteer({ email: 'booth@dash.test', role: 'VOLUNTEER' });
  counter = await createVolunteer({ email: 'counter@dash.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@dash.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@dash.test', role: 'CHIEF_COORDINATOR' });

  await assignToStationAllBlocks({ volunteerId: booth.id, stationId: boothStationId, eventDayId });
  await assignToStationAllBlocks({ volunteerId: counter.id, stationId: roomAId, eventDayId });
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId: boothStationId, eventDayId });
});

async function live(): Promise<request.Response> {
  return request(app).get('/api/v1/dashboard/live').set('Authorization', bearer(chief));
}

describe('access', () => {
  it('denies an IC the event-wide dashboard', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard/live')
      .set('Authorization', bearer(ic));

    expect(response.status).toBe(403);
  });

  it('denies a volunteer the station dashboard', async () => {
    const response = await request(app)
      .get(`/api/v1/dashboard/station/${boothStationId}`)
      .set('Authorization', bearer(booth));

    expect(response.status).toBe(403);
  });

  it('allows an IC the station dashboard', async () => {
    const response = await request(app)
      .get(`/api/v1/dashboard/station/${boothStationId}`)
      .set('Authorization', bearer(ic));

    expect(response.status).toBe(200);
  });
});

/** Phase 3 acceptance: the dashboard reflects a capture within 5 seconds. */
describe('the dashboard reflects a capture', () => {
  it('shows a registration immediately, with its unit', async () => {
    const before = await live();
    expect(before.body.registrations.todayTotal).toBe(0);

    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({ category: 'SEC_4', stationId: boothStationId, idempotencyKey: idempotencyKey() });

    // No caching layer between the capture and the dashboard, so "within five
    // seconds" is really "on the next three-second poll".
    const after = await live();
    expect(after.body.registrations.todayTotal).toBe(1);
    expect(after.body.registrations.unit).toBe('registrations');
  });

  it('shows a footfall tick immediately, with a different unit', async () => {
    await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(counter))
      .send({ stationId: roomAId, idempotencyKey: idempotencyKey() });

    const response = await live();
    expect(response.body.footfall.todayTotal).toBe(1);
    expect(response.body.footfall.unit).toBe('roomEntries');
  });

  it('never presents a combined visitor total', async () => {
    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({ category: 'SEC_4', stationId: boothStationId, idempotencyKey: idempotencyKey() });

    await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(counter))
      .send({ stationId: roomAId, idempotencyKey: idempotencyKey() });

    const response = await live();

    // The three counts are reported separately, each with its own unit, and
    // there is nothing on the payload that adds them together.
    expect(response.body.registrations.unit).toBe('registrations');
    expect(response.body.footfall.unit).toBe('roomEntries');
    expect(response.body.cards.unit).toBe('cards');
    expect(JSON.stringify(response.body)).not.toMatch(/totalVisitors/i);
  });
});

/** Phase 3 acceptance: a silent station is flagged within 15 minutes. */
describe('data health', () => {
  it('flags a counted room that has recorded nothing at all', async () => {
    await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(counter))
      .send({ stationId: roomAId, idempotencyKey: idempotencyKey() });

    const response = await live();
    const silent = response.body.dataHealth.silentStations as Array<{ stationName: string }>;

    // Room A is counting; Room B has never been opened, which is exactly the
    // case a total would hide.
    expect(silent.map((station) => station.stationName)).toEqual(['Room B']);
  });

  it('flags a station that has gone quiet past the threshold', async () => {
    // A tick recorded well before the silence threshold.
    await rawDb.footfallTick.create({
      data: {
        eventId: (await testEvent()).eventId,
        stationId: roomAId,
        recordedById: counter.id,
        quantity: 1,
        idempotencyKey: idempotencyKey(),
        recordedAt: new Date(FROZEN_NOW.getTime() - (SILENT_STATION_MINUTES + 5) * 60_000),
      },
    });

    const response = await live();
    const silent = response.body.dataHealth.silentStations as Array<{
      stationName: string;
      minutesSinceLastActivity: number;
    }>;

    const roomA = silent.find((station) => station.stationName === 'Room A');
    expect(roomA).toBeDefined();
    expect(roomA?.minutesSinceLastActivity).toBeGreaterThanOrEqual(SILENT_STATION_MINUTES);
  });

  it('does not flag a station that reported a moment ago', async () => {
    await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(counter))
      .send({ stationId: roomAId, idempotencyKey: idempotencyKey() });

    const response = await live();
    const silent = response.body.dataHealth.silentStations as Array<{ stationName: string }>;
    expect(silent.map((s) => s.stationName)).not.toContain('Room A');
  });

  it('flags a volunteer who is checked in but has recorded nothing', async () => {
    await rawDb.shiftAssignment.updateMany({
      where: { volunteerId: counter.id },
      data: { checkedInAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000) },
    });

    const response = await live();
    const stale = response.body.dataHealth.staleDevices as Array<{ volunteerName: string }>;

    // Distinct from a silent station: a colleague may be counting while this
    // person's phone sits in a pocket, and the station total would hide it.
    expect(stale.map((device) => device.volunteerName)).toContain(counter.email);
  });

  it('reports an open fallback window', async () => {
    await rawDb.fallbackWindow.create({
      data: {
        eventId: (await testEvent()).eventId,
        tier: 3,
        startedAt: new Date(FROZEN_NOW.getTime() - 30 * 60_000),
        declaredById: chief.id,
        reason: 'Backend unreachable from the booth',
      },
    });

    const response = await live();
    expect(response.body.dataHealth.fallbackWindowOpen).toBe(true);
  });
});

describe('staffing', () => {
  it('uses one inclusive observation for safety alerts and check-ins and excludes future entries', async () => {
    const { eventId } = await testEvent();
    const future = new Date(FROZEN_NOW.getTime() + 1);
    for (const at of [FROZEN_NOW, future]) {
      await rawDb.incident.create({ data: { eventId, type: 'OTHER', severity: 'CRITICAL', description: 'Test observation',
        occurredAt: at, reportedAt: at, reportedById: chief.id, idempotencyKey: idempotencyKey() } });
      await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: chief.id, raisedAt: at } });
    }
    const counterAssignment = await rawDb.shiftAssignment.findFirstOrThrow({ where: { eventId, volunteerId: counter.id,
      shift: { template: { code: 'MORNING' } } } });
    const futureAssignment = await rawDb.shiftAssignment.findFirstOrThrow({ where: { eventId, volunteerId: booth.id,
      shift: { template: { code: 'MORNING' } } } });
    await rawDb.shiftAssignment.update({ where: { id: counterAssignment.id },
      data: { checkedInAt: FROZEN_NOW, checkedOutAt: future } });
    await rawDb.shiftAssignment.update({ where: { id: futureAssignment.id }, data: { checkedInAt: future } });
    const response = await live();
    expect(response.status).toBe(200);
    expect(response.body.safety).toEqual({ openIncidents: 1, criticalIncidents: 1, activeLostPersonAlerts: 1 });
    expect(response.body.staffing.checkedIn).toBe(1);
    expect(response.body.dataHealth.staleDevices.map((row: { volunteerId: string }) => row.volunteerId)).not.toContain(booth.id);
    expect(response.body.staffing.gaps.some((row: { stationId: string }) => row.stationId === roomAId)).toBe(false);
  });

  it('reports stations with nobody rostered as unstaffed', async () => {
    const response = await live();
    const gaps = response.body.staffing.gaps as Array<{ stationName: string; severity: string }>;

    // Room B has no assignments at all.
    expect(gaps.find((gap) => gap.stationName === 'Room B')?.severity).toBe('UNSTAFFED');
  });

  it('distinguishes rostered-but-absent from unstaffed', async () => {
    const response = await live();
    const gaps = response.body.staffing.gaps as Array<{ stationName: string; severity: string }>;

    // Nobody has checked in anywhere yet, so the booth is staffed on paper only.
    expect(gaps.find((gap) => gap.stationName === 'Sign-Up Booth')?.severity).toBe(
      'NOBODY_CHECKED_IN',
    );
  });

  it('drops a station from the gaps once everyone has checked in', async () => {
    await rawDb.shiftAssignment.updateMany({
      where: { stationId: roomAId },
      data: { checkedInAt: FROZEN_NOW },
    });

    const response = await live();
    const gaps = response.body.staffing.gaps as Array<{ stationName: string }>;
    expect(gaps.map((gap) => gap.stationName)).not.toContain('Room A');
  });

  it('warns about anyone on station three hours without a break', async () => {
    await rawDb.shiftAssignment.updateMany({
      where: { volunteerId: counter.id },
      data: { checkedInAt: new Date(FROZEN_NOW.getTime() - 200 * 60_000) },
    });

    const response = await live();
    const long = response.body.staffing.longShifts as Array<{ minutesOnStation: number }>;

    expect(long).toHaveLength(1);
    expect(long[0]?.minutesOnStation).toBe(200);
  });
});

describe('the station console', () => {
  it('breaks registrations down per device', async () => {
    for (let index = 0; index < 3; index += 1) {
      await request(app)
        .post('/api/v1/registrations')
        .set('Authorization', bearer(booth))
        .send({ category: 'SEC_4', stationId: boothStationId, idempotencyKey: idempotencyKey() });
    }

    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(ic))
      .send({ category: 'SEC_1', stationId: boothStationId, idempotencyKey: idempotencyKey() });

    const response = await request(app)
      .get(`/api/v1/dashboard/station/${boothStationId}`)
      .set('Authorization', bearer(ic));

    const devices = response.body.registrations.byDevice as Array<{
      volunteerName: string;
      value: number;
    }>;

    // Two people on one queue, each with their own number — which is how a
    // discrepancy becomes visible while it can still be explained.
    expect(devices).toHaveLength(2);
    expect(devices.find((device) => device.volunteerName === booth.email)?.value).toBe(3);
    expect(response.body.registrations.todayTotal).toBe(4);
  });

  it('lists who is rostered and whether they arrived', async () => {
    const response = await request(app)
      .get(`/api/v1/dashboard/station/${boothStationId}`)
      .set('Authorization', bearer(ic));

    const roster = response.body.roster as Array<{ checkedInAt: string | null }>;
    expect(roster.length).toBeGreaterThan(0);
    expect(roster.every((person) => person.checkedInAt === null)).toBe(true);
  });

  it('allows foreign-station IC counts without exposing names, device contributions, roster or redemption flags', async () => {
    const { eventId } = await testEvent();
    const member = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: counter.id } });
    const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId } });
    for (const source of ['APP', 'FALLBACK_SHEET', 'PAPER'] as const) {
      await rawDb.registration.create({ data: { eventId, stationId: roomAId, recordedById: counter.id,
        recordedByMembershipId: member.id, categoryId: category.id, source, recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey() } });
      await rawDb.footfallTick.create({ data: { eventId, stationId: roomAId, recordedById: counter.id,
        recordedByMembershipId: member.id, source, quantity: source === 'APP' ? 2 : source === 'PAPER' ? 3 : 5,
        recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey() } });
    }
    const gift = await rawDb.giftType.create({ data: { eventId, name: 'Private flagged gift', initialStock: 1 } });
    await rawDb.giftRedemption.create({ data: { eventId, giftTypeId: gift.id, stationId: roomAId, recordedById: counter.id,
      recordedByMembershipId: member.id, flag: 'OVER_STOCK', recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey() } });
    const response = await request(app).get(`/api/v1/dashboard/station/${roomAId}`).set('Authorization', bearer(ic));
    expect(response.status).toBe(200);
    expect(response.body.registrations.todayTotal).toBe(3);
    expect(response.body.footfall.todayTotal).toBe(10);
    expect(response.body.registrations.sourceBreakdown).toEqual(expect.arrayContaining([
      { source: 'APP', value: 1 }, { source: 'FALLBACK_SHEET', value: 1 }, { source: 'PAPER', value: 1 },
    ]));
    expect(response.body.rosterAvailability).toBe('denied');
    expect(response.body.deviceAvailability).toBe('denied');
    expect(response.body.roster).toEqual([]);
    expect(response.body.registrations.byDevice).toEqual([]);
    expect(response.body.footfall.contributors).toEqual([]);
    expect(response.body.flaggedRedemptions).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain(counter.email);
    expect(JSON.stringify(response.body)).not.toContain('Private flagged gift');
    const authorized = await request(app).get(`/api/v1/dashboard/station/${roomAId}`).set('Authorization', bearer(chief));
    expect(authorized.status).toBe(200);
    expect(authorized.body.registrations.todayTotal).toBe(3);
    expect(authorized.body.registrations.byDevice).toHaveLength(1);
    expect(authorized.body.registrations.byDevice[0].value).toBe(1);
    expect(authorized.body.footfall.contributors[0].value).toBe(2);
    expect(authorized.body.flaggedRedemptions).toHaveLength(1);
  });

  it('keeps a device stale when its only recent captures are imports or voided APP rows', async () => {
    const { eventId } = await testEvent();
    const member = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: counter.id } });
    await rawDb.shiftAssignment.updateMany({ where: { eventId, volunteerId: counter.id },
      data: { checkedInAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000) } });
    for (const capture of [{ source: 'APP' as const, at: new Date(FROZEN_NOW.getTime() - 20 * 60_000), voided: false },
      { source: 'FALLBACK_SHEET' as const, at: FROZEN_NOW, voided: false },
      { source: 'APP' as const, at: FROZEN_NOW, voided: true }]) {
      await rawDb.footfallTick.create({ data: { eventId, stationId: roomAId, recordedById: counter.id,
        recordedByMembershipId: member.id, recordedAt: capture.at, source: capture.source, voided: capture.voided,
        quantity: 1, idempotencyKey: idempotencyKey() } });
    }
    const response = await live();
    expect(response.status).toBe(200);
    expect(response.body.dataHealth.staleDevices.map((row: { volunteerId: string }) => row.volunteerId)).toContain(counter.id);
    const station = await request(app).get(`/api/v1/dashboard/station/${roomAId}`).set('Authorization', bearer(chief));
    expect(station.body.footfall.todayTotal).toBe(2);
    expect(station.body.footfall.contributors[0].value).toBe(1);
    expect(station.body.footfall.lastActivityAt).toBe(FROZEN_NOW.toISOString());
  });
});
