import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * The mandatory test cases from BUILD_PLAN §10.
 *
 * These encode the domain rules rather than the implementation: they are the
 * tests that should still be here after the code underneath them is rewritten.
 */

let app: Express;
let booth: TestVolunteer;
let counter: TestVolunteer;
let ic: TestVolunteer;
let boothStationId: string;
let roomAId: string;
let roomBId: string;
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
  roomBId = (await createStation({ code: 'ROOM_B', name: 'Room B', countsEntry: true })).id;

  booth = await createVolunteer({ email: 'booth@capture.test', role: 'VOLUNTEER' });
  counter = await createVolunteer({ email: 'counter@capture.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@capture.test', role: 'IC' });

  await assignToStationAllBlocks({ volunteerId: booth.id, stationId: boothStationId, eventDayId });
  await assignToStationAllBlocks({ volunteerId: counter.id, stationId: roomAId, eventDayId });
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId: boothStationId, eventDayId });
});

async function tapRegistration(
  actor: TestVolunteer,
  category = 'SEC_4',
  key = idempotencyKey(),
): Promise<request.Response> {
  return request(app)
    .post('/api/v1/registrations')
    .set('Authorization', bearer(actor))
    .send({ category, stationId: boothStationId, idempotencyKey: key });
}

async function tapFootfall(
  actor: TestVolunteer,
  stationId: string,
  key = idempotencyKey(),
): Promise<request.Response> {
  return request(app)
    .post('/api/v1/footfall/ticks')
    .set('Authorization', bearer(actor))
    .send({ stationId, idempotencyKey: key });
}

/** §10 case 1 — the load-bearing rule of the whole system. */
describe('the three counts never merge', () => {
  it('reports registrations and footfall as different numbers in different units', async () => {
    await tapRegistration(booth, 'SEC_4');
    await tapRegistration(booth, 'PARENT_GUARDIAN');
    await tapFootfall(counter, roomAId);
    await tapFootfall(counter, roomAId);
    await tapFootfall(counter, roomAId);

    const registrations = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));

    const footfall = await request(app)
      .get('/api/v1/footfall/summary?bucket=30m')
      .set('Authorization', bearer(ic));

    expect(registrations.body.unit).toBe('registrations');
    expect(registrations.body.total).toBe(2);

    expect(footfall.body.unit).toBe('roomEntries');
    expect(footfall.body.total).toBe(3);

    // No endpoint offers a combined figure, and the units differ, so there is
    // nothing a caller could add together and believe.
    expect(registrations.body.unit).not.toBe(footfall.body.unit);
    expect(registrations.body).not.toHaveProperty('totalVisitors');
    expect(footfall.body).not.toHaveProperty('totalVisitors');
  });
});

/** §10 case 2 — what makes the client's outbox safe. */
describe('idempotency', () => {
  it('replays the identical response and creates exactly one row', async () => {
    const key = idempotencyKey();

    const first = await tapRegistration(booth, 'SEC_4', key);
    const second = await tapRegistration(booth, 'SEC_4', key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.registration.id).toBe(first.body.registration.id);
    expect(second.body.registration.recordedAt).toBe(first.body.registration.recordedAt);

    expect(await prisma.registration.count()).toBe(1);
  });

  it('rejects the same key used for a different endpoint', async () => {
    const key = idempotencyKey();

    await tapRegistration(booth, 'SEC_4', key);
    const reuse = await tapFootfall(counter, roomAId, key);

    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe('IDEMPOTENCY_KEY_REUSE');
  });
});

/** §10 cases 3 and 4 — station scope, and the audited IC bypass. */
describe('station scope', () => {
  it('denies a volunteer posting a tick to a station they are not on', async () => {
    const response = await tapFootfall(counter, roomBId);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STATION_SCOPE_DENIED');
    expect(await prisma.footfallTick.count()).toBe(0);
  });

  it('lets an IC post outside their assignment and records the bypass', async () => {
    const response = await tapFootfall(ic, roomBId);

    expect(response.status).toBe(201);

    const bypass = await prisma.auditLog.findFirst({
      where: { action: 'auth.stationScopeBypass', entityId: roomBId },
    });
    expect(bypass).not.toBeNull();
    expect(bypass?.actorId).toBe(ic.id);
  });

  it('does not record a bypass when the IC is on their own station', async () => {
    await tapRegistration(ic);

    const bypass = await prisma.auditLog.findFirst({
      where: { action: 'auth.stationScopeBypass' },
    });
    expect(bypass).toBeNull();
  });
});

/** §10 case 5 — the family-of-four problem, handled honestly. */
describe('group registration', () => {
  it('writes one row per person and one group id', async () => {
    const response = await request(app)
      .post('/api/v1/registrations/group')
      .set('Authorization', bearer(booth))
      .send({
        stationId: boothStationId,
        members: [
          { category: 'SEC_4', count: 1 },
          { category: 'PARENT_GUARDIAN', count: 2 },
        ],
        idempotencyKey: idempotencyKey(),
      });

    expect(response.status).toBe(201);
    expect(response.body.registrations).toHaveLength(3);

    const groupIds = new Set(
      response.body.registrations.map((r: { groupId: string }) => r.groupId),
    );
    expect(groupIds.size).toBe(1);

    expect(await prisma.registration.count()).toBe(3);
  });

  it('still records the registrations when the card link fails', async () => {
    const response = await request(app)
      .post('/api/v1/registrations/group')
      .set('Authorization', bearer(booth))
      .send({
        stationId: boothStationId,
        members: [{ category: 'SEC_4', count: 2 }],
        missionCardShortCode: 'ZZZZZZ',
        idempotencyKey: idempotencyKey(),
      });

    // An optional path must never block a mandatory one (PRODUCT_BRIEF §2.3).
    expect(response.status).toBe(201);
    expect(response.body.registrations).toHaveLength(2);
    expect(response.body.linkedCardId).toBeNull();
    expect(response.body.cardLinkError).toContain('Card not found');
  });
});

/** §10 case 6 — voiding corrects the number without destroying the evidence. */
describe('voiding', () => {
  it('excludes a voided registration from the summary but keeps the row', async () => {
    const created = await tapRegistration(booth, 'SEC_4');
    const id = created.body.registration.id;

    const before = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(before.body.total).toBe(1);

    const voided = await request(app)
      .post(`/api/v1/registrations/${id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Double tap while the queue was moving' });
    expect(voided.status).toBe(204);

    const after = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(after.body.total).toBe(0);

    const row = await prisma.registration.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.voided).toBe(true);
    expect(row?.voidedReason).toBe('Double tap while the queue was moving');
  });

  it('refuses to void the same record twice', async () => {
    const created = await tapRegistration(booth, 'SEC_4');
    const id = created.body.registration.id;

    await request(app)
      .post(`/api/v1/registrations/${id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'first correction' });

    const second = await request(app)
      .post(`/api/v1/registrations/${id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'second attempt' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_VOIDED');
  });

  it('writes an audit row for the void', async () => {
    const created = await tapRegistration(booth, 'SEC_4');
    await request(app)
      .post(`/api/v1/registrations/${created.body.registration.id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Counted on paper as well' });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'registration.void' } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(ic.id);
  });
});

describe('footfall integrity', () => {
  it('refuses a tick for a room that is not counted', async () => {
    // The booth is not a footfall-counted room. Accepting a tick there would
    // put entries into a total nobody expects them in.
    const response = await tapFootfall(ic, boothStationId);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STATION_DOES_NOT_COUNT_ENTRY');
  });

  it('sums quantities rather than counting rows, so bulk entry is not lost', async () => {
    await tapFootfall(counter, roomAId);

    await request(app).post('/api/v1/footfall/bulk').set('Authorization', bearer(ic)).send({
      stationId: roomAId,
      quantity: 240,
      timeBlockStart: new Date().toISOString(),
      source: 'PAPER',
      reason: 'Physical clicker total for the 11:00 block',
      idempotencyKey: idempotencyKey(),
    });

    const summary = await request(app)
      .get('/api/v1/footfall/summary?bucket=1h')
      .set('Authorization', bearer(ic));

    expect(summary.body.total).toBe(241);
  });

  it('keeps the source of manual entry distinguishable', async () => {
    await request(app).post('/api/v1/footfall/bulk').set('Authorization', bearer(ic)).send({
      stationId: roomAId,
      quantity: 30,
      timeBlockStart: new Date().toISOString(),
      source: 'FALLBACK_SHEET',
      reason: 'Transcribed from the fallback sheet',
      idempotencyKey: idempotencyKey(),
    });

    const rows = await prisma.footfallTick.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe('FALLBACK_SHEET');
    expect(rows[0]?.timeBlockStart).not.toBeNull();
  });

  it('flags a station with no activity as silent', async () => {
    await tapFootfall(counter, roomAId);

    const live = await request(app).get('/api/v1/footfall/live').set('Authorization', bearer(ic));

    const byName = new Map(
      live.body.stations.map((s: { stationName: string; silent: boolean }) => [
        s.stationName,
        s.silent,
      ]),
    );

    expect(byName.get('Room A')).toBe(false);
    // The station nobody is counting at is the one the dashboard must surface.
    expect(byName.get('Room B')).toBe(true);
  });
});

/** §10 case 8 — a report must say when it contains non-app data. */
describe('fallback annotation', () => {
  it('flags a summary whose range overlaps a declared fallback window', async () => {
    await tapRegistration(booth, 'SEC_4');

    const clean = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(clean.body.containsFallbackData).toBe(false);

    await prisma.fallbackWindow.create({
      data: {
        tier: 3,
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        endedAt: null,
        declaredById: ic.id,
        reason: 'Backend unreachable from the booth',
      },
    });

    const flagged = await request(app)
      .get('/api/v1/registrations/summary?groupBy=category')
      .set('Authorization', bearer(ic));
    expect(flagged.body.containsFallbackData).toBe(true);
  });
});

describe('input validation', () => {
  it('rejects an unknown key rather than ignoring it', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({
        category: 'SEC_4',
        stationId: boothStationId,
        // A client must not be able to attribute a capture to someone else.
        recordedById: ic.id,
        idempotencyKey: idempotencyKey(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('attributes the capture to the token, never to the body', async () => {
    await tapRegistration(booth, 'SEC_4');

    const row = await prisma.registration.findFirst();
    expect(row?.recordedById).toBe(booth.id);
  });

  it('rejects an unknown visitor category', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({ category: 'TEACHER', stationId: boothStationId, idempotencyKey: idempotencyKey() });

    expect(response.status).toBe(400);
  });
});
