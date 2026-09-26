import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * Route contracts for the routes P03.6 found with no integration test (P06.1).
 *
 * Characterisation, not specification: each test pins what the route does on
 * the unrefactored code (status, response shape, the capability that guards
 * it) so that P06's moves can be shown to change nothing. Where a route has a
 * known bug, the bug's own repro in `repro/` asserts the fix; nothing here
 * encodes a bug as correct.
 */

let app: Express;
let volunteer: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let admin: TestVolunteer;
let stationId: string;
let eventDayId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  eventDayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'DESK', name: 'Desk', countsEntry: true })).id;
  volunteer = await createVolunteer({ email: 'v@contracts.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@contracts.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@contracts.test', role: 'CHIEF_COORDINATOR' });
  admin = await createVolunteer({ email: 'admin@contracts.test', role: 'ADMIN' });
  await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId, eventDayId });
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId, eventDayId });
});

function as(actor: TestVolunteer) {
  const auth = bearer(actor);
  return {
    get: (path: string) => request(app).get(`/api/v1${path}`).set('Authorization', auth),
    post: (path: string, body: object = {}) =>
      request(app).post(`/api/v1${path}`).set('Authorization', auth).send(body),
    patch: (path: string, body: object) =>
      request(app).patch(`/api/v1${path}`).set('Authorization', auth).send(body),
    delete: (path: string, body: object) =>
      request(app).delete(`/api/v1${path}`).set('Authorization', auth).send(body),
  };
}

describe('me and attendance', () => {
  it('POST /me/check-out ends a shift the volunteer checked in to', async () => {
    const assignment = await prisma.shiftAssignment.findFirstOrThrow({
      where: { volunteerId: volunteer.id, block: 'MORNING' },
    });
    await prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: { checkedInAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000) },
    });

    const response = await as(volunteer).post('/me/check-out', { assignmentId: assignment.id });

    expect(response.status).toBe(200);
    expect(response.body.assignment.id).toBe(assignment.id);
    expect(response.body.assignment.checkedOutAt).toBe(FROZEN_NOW.toISOString());
  });

  it('POST /me/check-out refuses someone else’s shift', async () => {
    const assignment = await prisma.shiftAssignment.findFirstOrThrow({
      where: { volunteerId: ic.id, block: 'MORNING' },
    });

    const response = await as(volunteer).post('/me/check-out', { assignmentId: assignment.id });

    expect(response.status).toBe(403);
  });

  it('GET /attendance reports today’s status without caching', async () => {
    const response = await as(volunteer).get('/attendance');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.eventDay).toEqual({ id: eventDayId, label: 'Test Day' });
  });
});

describe('corrections and safety', () => {
  it('POST /footfall/ticks/:id/void voids a tick (IC) and hides it from the totals', async () => {
    const tick = await as(volunteer).post('/footfall/ticks', {
      stationId,
      idempotencyKey: idempotencyKey(),
    });
    expect(tick.status).toBe(201);
    const tickId = (await prisma.footfallTick.findFirstOrThrow({ where: { stationId } })).id;

    expect(
      (await as(volunteer).post(`/footfall/ticks/${tickId}/void`, { reason: 'mis-tap' })).status,
    ).toBe(403);
    const response = await as(ic).post(`/footfall/ticks/${tickId}/void`, { reason: 'mis-tap' });

    expect(response.status).toBe(204);
    const row = await prisma.footfallTick.findUniqueOrThrow({ where: { id: tickId } });
    expect(row.voided).toBe(true);
  });

  it('POST /incidents/:id/follow-ups and /status work an incident (IC)', async () => {
    const reported = await as(volunteer).post('/incidents', {
      idempotencyKey: idempotencyKey(),
      type: 'INJURY',
      severity: 'LOW',
      stationId,
      description: 'Grazed knee on the stairs',
      occurredAt: FROZEN_NOW.toISOString(),
    });
    expect(reported.status).toBe(201);
    const id = reported.body.incident.id as string;

    expect(
      (await as(volunteer).post(`/incidents/${id}/follow-ups`, { note: 'plaster' })).status,
    ).toBe(403);

    const followUp = await as(ic).post(`/incidents/${id}/follow-ups`, { note: 'Plaster applied' });
    expect(followUp.status).toBe(201);
    expect(followUp.body.incident.id).toBe(id);

    const status = await as(ic).post(`/incidents/${id}/status`, { status: 'ACKNOWLEDGED' });
    expect(status.status).toBe(200);
    expect(status.body.incident.status).toBe('ACKNOWLEDGED');
  });

  it('POST /lost-found/:id/claim and /close-out move items through their states', async () => {
    const logged = await as(ic).post('/lost-found', { itemLabel: 'Blue water bottle' });
    expect(logged.status).toBe(201);
    const claimedId = logged.body.item.id as string;
    const held = await as(ic).post('/lost-found', { itemLabel: 'Umbrella' });

    const claim = await as(ic).post(`/lost-found/${claimedId}/claim`, { note: 'at the desk' });
    expect(claim.status).toBe(200);
    expect(claim.body.item.status).toBe('CLAIMED');

    expect((await as(ic).post('/lost-found/close-out')).status).toBe(403);
    const closeOut = await as(chief).post('/lost-found/close-out');
    expect(closeOut.status).toBe(200);
    expect(closeOut.body.markedUnclaimed).toBe(1);
    const umbrella = await prisma.lostFoundItem.findUniqueOrThrow({
      where: { id: held.body.item.id as string },
    });
    expect(umbrella.status).toBe('UNCLAIMED_AT_CLOSE');
  });

  it('GET /dashboard/data-health answers the Chief, not a volunteer', async () => {
    expect((await as(volunteer).get('/dashboard/data-health')).status).toBe(403);

    const response = await as(chief).get('/dashboard/data-health');

    expect(response.status).toBe(200);
    expect(response.body.asOf).toBe(FROZEN_NOW.toISOString());
  });
});

describe('roster reads', () => {
  it('GET /roster/me lists the volunteer’s own shifts', async () => {
    const response = await as(volunteer).get('/roster/me');

    expect(response.status).toBe(200);
    expect(response.body.meta.nextCursor).toBeNull();
    expect(response.body.data.length).toBe(response.body.meta.count);
  });

  it('GET /roster/station/:stationId lists the station roster for an IC', async () => {
    expect((await as(volunteer).get(`/roster/station/${stationId}`)).status).toBe(403);

    const response = await as(ic).get(`/roster/station/${stationId}`);

    expect(response.status).toBe(200);
    expect(response.body.meta.count).toBe(4);
  });

  it('GET /roster/swaps/pending lists open swap requests for an approver', async () => {
    expect((await as(volunteer).get('/roster/swaps/pending')).status).toBe(403);

    const response = await as(chief).get('/roster/swaps/pending');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [], meta: { count: 0, nextCursor: null } });
  });

  it('GET /roster/gaps reports staffing gaps to the Chief', async () => {
    expect((await as(ic).get('/roster/gaps')).status).toBe(403);

    const response = await as(chief).get('/roster/gaps');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.gaps)).toBe(true);
  });

  it('GET /gifts/summary summarises redemptions for an IC', async () => {
    expect((await as(volunteer).get('/gifts/summary')).status).toBe(403);

    const response = await as(ic).get('/gifts/summary');

    expect(response.status).toBe(200);
  });
});

describe('admin writes', () => {
  it('POST /admin/assignments rosters a volunteer (roster.edit)', async () => {
    const newcomer = await createVolunteer({ email: 'new@contracts.test', role: 'VOLUNTEER' });
    const body = { volunteerId: newcomer.id, stationId, eventDayId, block: 'AFTERNOON' };

    expect((await as(ic).post('/admin/assignments', body)).status).toBe(403);
    const response = await as(chief).post('/admin/assignments', body);

    expect(response.status).toBe(201);
    expect(
      await prisma.shiftAssignment.count({
        where: { volunteerId: newcomer.id, block: 'AFTERNOON' },
      }),
    ).toBe(1);
  });

  it('PATCH /admin/event-days/:id relabels a day (config.manage) and audits it', async () => {
    expect((await as(ic).patch(`/admin/event-days/${eventDayId}`, { label: 'Day 1' })).status).toBe(
      403,
    );

    const response = await as(admin).patch(`/admin/event-days/${eventDayId}`, { label: 'Day 1' });

    expect(response.status).toBe(200);
    const day = await prisma.eventDay.findUniqueOrThrow({ where: { id: eventDayId } });
    expect(day.label).toBe('Day 1');
  });
});

describe('push and media without their AWS configuration', () => {
  const subscription = {
    endpoint: 'https://push.example.test/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  };

  it('GET /notifications/config reports push as disabled', async () => {
    const response = await as(volunteer).get('/notifications/config');

    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(false);
  });

  it('POST and DELETE /notifications/subscriptions store and remove a device', async () => {
    const created = await as(volunteer).post('/notifications/subscriptions', subscription);
    expect(created.status).toBe(201);
    expect(created.body.enabled).toBe(false);
    expect(await prisma.pushSubscription.count({ where: { volunteerId: volunteer.id } })).toBe(1);

    const removed = await as(volunteer).delete('/notifications/subscriptions', {
      endpoint: subscription.endpoint,
    });
    expect(removed.status).toBe(204);
    expect(await prisma.pushSubscription.count({ where: { volunteerId: volunteer.id } })).toBe(0);
  });

  it('GET /media/config reports uploads as disabled', async () => {
    const response = await as(volunteer).get('/media/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: false });
  });

  it('POST /media/uploads and GET /media/url answer 503 with no bucket', async () => {
    const lead = await createVolunteer({ email: 'lead@contracts.test', role: 'LEAD' });
    expect(
      (
        await as(lead).post('/media/uploads', {
          purpose: 'lostFound',
          contentType: 'image/jpeg',
          contentLength: 1000,
        })
      ).status,
    ).toBe(403);

    const upload = await as(ic).post('/media/uploads', {
      purpose: 'lostFound',
      contentType: 'image/jpeg',
      contentLength: 1000,
    });
    expect(upload.status).toBe(503);
    expect(upload.body.error.code).toBe('MEDIA_NOT_CONFIGURED');

    const url = await as(volunteer).get('/media/url?key=lost-found/abc.jpg');
    expect(url.status).toBe(503);
  });
});

describe('an assignment helper sanity check', () => {
  it('rosters the fixture volunteers in both blocks', async () => {
    await assignToStation({ volunteerId: chief.id, stationId, eventDayId });
    expect(await prisma.shiftAssignment.count({ where: { stationId } })).toBe(5);
  });
});
