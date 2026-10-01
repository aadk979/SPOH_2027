import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as access from '../../src/platform/access/index.js';
import { resetDatabase, rawDb } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createEventDayOn,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * P09.5: "on shift now" is the shift's own hours, not the configured blocks.
 * The frozen clock sits inside the MORNING template's hours; moving that day's
 * morning shift changes who may capture and what `/me` calls current.
 */

let app: Express;
let booth: TestVolunteer;
let stationId: string;
let eventDayId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  eventDayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'BOOTH' })).id;
  booth = await createVolunteer({ email: 'booth@shifts.test', role: 'VOLUNTEER' });
  await assignToStation({ volunteerId: booth.id, stationId, eventDayId, shift: 'MORNING' });
});

async function moveMorningShift(window: { startsAt: Date; endsAt: Date }): Promise<void> {
  const { eventId } = await testEvent();
  await rawDb.shift.updateMany({
    where: { eventId, eventDayId, template: { code: 'MORNING' } },
    data: { ...window, overridden: true },
  });
}

const tap = () =>
  request(app)
    .post('/api/v1/registrations')
    .set('Authorization', bearer(booth))
    .send({ category: 'SEC_3', stationId, idempotencyKey: idempotencyKey() });

describe('on shift now (P09.5)', () => {
  it('lets the rostered volunteer capture while their shift runs', async () => {
    expect((await tap()).status).toBe(201);
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer(booth));
    expect(me.body.currentAssignment?.station.id).toBe(stationId);
  });

  it('closes capture when the shift itself has ended, whatever the block hours say', async () => {
    await moveMorningShift({
      startsAt: new Date(FROZEN_NOW.getTime() - 3 * 60 * 60_000),
      endsAt: new Date(FROZEN_NOW.getTime() - 60_000),
    });

    const response = await tap();
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STATION_SCOPE_DENIED');
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer(booth));
    expect(me.body.currentAssignment).toBeNull();
  });
});

describe('rehearsal shift access (P10.5)', () => {
  beforeEach(async () => {
    await moveMorningShift({
      startsAt: new Date(FROZEN_NOW.getTime() - 3 * 60 * 60_000),
      endsAt: new Date(FROZEN_NOW.getTime() - 60_000),
    });
    const { eventId } = await testEvent();
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'REHEARSAL' } });
  });

  it('allows assigned practice outside hours, then refuses the same volunteer in LIVE', async () => {
    const { eventId } = await testEvent();
    expect((await tap()).status).toBe(201);
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer(booth));
    expect(me.body.currentAssignment?.station.id).toBe(stationId);
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
    const refused = await tap();
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('STATION_SCOPE_DENIED');
    expect(await rawDb.registration.count({ where: { eventId, rehearsal: true } })).toBe(1);
    expect(await rawDb.registration.count({ where: { eventId, rehearsal: false } })).toBe(0);
    const liveMe = await request(app).get('/api/v1/me').set('Authorization', bearer(booth));
    expect(liveMe.body.currentAssignment).toBeNull();
  });

  it('permits an assigned station on another event day during practice', async () => {
    const { eventId } = await testEvent();
    await rawDb.shiftAssignment.deleteMany({ where: { eventId, volunteerId: booth.id } });
    const day = await createEventDayOn('2027-01-08');
    await assignToStation({
      volunteerId: booth.id,
      stationId,
      eventDayId: day.id,
      shift: 'MORNING',
    });
    expect((await tap()).status).toBe(201);
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
    expect((await tap()).status).toBe(403);
  });

  it('still refuses a volunteer with no station assignment', async () => {
    const { eventId } = await testEvent();
    await rawDb.shiftAssignment.deleteMany({ where: { eventId, volunteerId: booth.id } });
    expect((await tap()).status).toBe(403);
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  });

  it('keeps dashboard staffing and warnings on actual hours while practice capture is open', async () => {
    const admin = await createVolunteer({ email: 'admin@shifts.test', role: 'ADMIN' });
    expect((await tap()).status).toBe(201);
    for (const query of ['', '?includeRehearsal=true']) {
      const response = await request(app)
        .get(`/api/v1/dashboard/live${query}`)
        .set('Authorization', bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body.staffing.onShift).toBe(0);
      expect(response.body.withinEventHours).toBe(false);
      expect(response.body.dataHealth.withinEventHours).toBe(false);
      expect(response.body.dataHealth.silentStations).toEqual([]);
    }
  });

  it('rechecks a legacy request if go-live occurs after its middleware check', async () => {
    const { eventId } = await testEvent();
    const original = access.isOnShiftAt;
    const check = vi.spyOn(access, 'isOnShiftAt').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      expect(allowed).toBe(true);
      await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
      return allowed;
    });
    try {
      const refused = await tap();
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('STATION_SCOPE_DENIED');
      expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
    } finally {
      check.mockRestore();
    }
  });

  it('keeps the IC correction bypass and audits it after a concurrent go-live', async () => {
    const { eventId } = await testEvent();
    const ic = await createVolunteer({ email: 'ic@shifts.test', role: 'IC' });
    await assignToStation({ volunteerId: ic.id, stationId, eventDayId, shift: 'MORNING' });
    const original = access.isOnShiftAt;
    const check = vi.spyOn(access, 'isOnShiftAt').mockImplementationOnce(async (...args) => {
      const allowed = await original(...args);
      expect(allowed).toBe(true);
      await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
      return allowed;
    });
    try {
      const recorded = await request(app)
        .post('/api/v1/registrations')
        .set('Authorization', bearer(ic))
        .send({ category: 'SEC_3', stationId, idempotencyKey: idempotencyKey() });
      expect(recorded.status).toBe(201);
      expect(await rawDb.registration.count({ where: { eventId, rehearsal: false } })).toBe(1);
      expect(
        await rawDb.auditLog.count({
          where: {
            eventId,
            actorId: ic.id,
            action: 'auth.stationScopeBypass',
            entityId: stationId,
          },
        }),
      ).toBe(1);
    } finally {
      check.mockRestore();
    }
  });
});
