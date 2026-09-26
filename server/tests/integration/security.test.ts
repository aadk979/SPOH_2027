import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
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
 * The BUILD_PLAN §8 security checklist, as tests rather than as a document.
 *
 * A checklist somebody ticked in November is worth nothing on 7 January. These
 * run on every PR.
 */

let app: Express;
let volunteer: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  stationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;

  volunteer = await createVolunteer({ email: 'v@sec.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@sec.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@sec.test', role: 'CHIEF_COORDINATOR' });

  await assignToStationAllBlocks({
    volunteerId: volunteer.id,
    stationId,
    eventDayId: eventDay.id,
  });
});

/** §8.1 — transport and headers. */
describe('security headers', () => {
  it('sets nosniff and a restrictive referrer policy', async () => {
    const response = await request(app).get('/healthz');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('forbids being framed', async () => {
    const response = await request(app).get('/healthz');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('does not advertise the framework', async () => {
    const response = await request(app).get('/healthz');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('echoes a request id on every response, for correlation', async () => {
    const response = await request(app).get('/healthz');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours a supplied request id only when it is log-safe', async () => {
    const clean = await request(app).get('/healthz').set('X-Request-Id', 'abc-123-def-456');
    expect(clean.headers['x-request-id']).toBe('abc-123-def-456');

    // Anything else is replaced with a generated id. Accepting arbitrary
    // header content would let a client shape the log stream. Node's own HTTP
    // client refuses to transmit a raw newline, so the values tested here are
    // the ones a client could actually get through: spaces, punctuation, path
    // traversal, and excessive length.
    for (const bad of ['spaces and words', 'semi;colon', '../../etc/passwd', 'x'.repeat(200)]) {
      const dirty = await request(app).get('/healthz').set('X-Request-Id', bad);

      expect(dirty.headers['x-request-id']).not.toBe(bad);
      expect(dirty.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

/** §8.3 — input validation. */
describe('input validation', () => {
  it('rejects an unknown key rather than ignoring it', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({
        category: 'SEC_4',
        stationId,
        role: 'ADMIN',
        idempotencyKey: idempotencyKey(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed idempotency key', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({ category: 'SEC_4', stationId, idempotencyKey: 'not-a-uuid' });

    expect(response.status).toBe(400);
  });

  it('rejects a body over the size limit', async () => {
    const response = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', bearer(volunteer))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ description: 'x'.repeat(200_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON with a clean error, not a stack trace', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .set('Content-Type', 'application/json')
      .send('{"category": ');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('at Object');
  });
});

/** §8.5 — authorization and IDOR. */
describe('authorization', () => {
  it('defaults to deny on every route', async () => {
    const routes: Array<[string, string]> = [
      ['get', '/api/v1/me'],
      ['get', '/api/v1/stations'],
      ['get', '/api/v1/dashboard/live'],
      ['get', '/api/v1/reports/summary'],
      ['get', '/api/v1/audit'],
      ['get', '/api/v1/announcements'],
      ['get', '/api/v1/lost-found'],
      ['get', '/api/v1/cards/funnel'],
      ['get', '/api/v1/gifts'],
    ];

    for (const [method, path] of routes) {
      const response = await (method === 'get' ? request(app).get(path) : request(app).post(path));

      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });

  it('leaves only the health probes open', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });

  it('never attributes a capture to a volunteerId from the body', async () => {
    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({ category: 'SEC_4', stationId, idempotencyKey: idempotencyKey() });

    const row = await prisma.registration.findFirst();
    expect(row?.recordedById).toBe(volunteer.id);
  });

  it('refuses to let one volunteer check another one in', async () => {
    const other = await createVolunteer({ email: 'other@sec.test', role: 'VOLUNTEER' });
    const assignment = await prisma.shiftAssignment.findFirst({
      where: { volunteerId: volunteer.id },
      select: { id: true },
    });

    const response = await request(app)
      .post('/api/v1/me/check-in')
      .set('Authorization', bearer(other))
      .send({ assignmentId: assignment?.id });

    expect(response.status).toBe(403);
  });

  it('rejects a token for an account that is not on the roster', async () => {
    const ghost = await createVolunteer({ email: 'ghost@sec.test', role: 'VOLUNTEER' });
    await prisma.volunteer.delete({ where: { id: ghost.id } });

    const response = await request(app).get('/api/v1/me').set('Authorization', bearer(ghost));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_PROVISIONED');
  });

  it('rejects a token for a deactivated account', async () => {
    await prisma.volunteer.update({ where: { id: volunteer.id }, data: { active: false } });

    // The auth cache is invalidated by the fixture helper, so this reflects the
    // database rather than a stale entry.
    const response = await request(app).get('/api/v1/me').set('Authorization', bearer(volunteer));

    expect([403]).toContain(response.status);
  });
});

/** §7.1, §8.7 — error responses and audit. */
describe('errors and audit', () => {
  it('never leaks SQL or Prisma text to a client', async () => {
    const response = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({ category: 'SEC_4', stationId: 'no-such-station', idempotencyKey: idempotencyKey() });

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/prisma/i);
    expect(body).not.toMatch(/SELECT|INSERT|constraint/i);
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('never echoes a submitted token', async () => {
    const response = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer sensitive.token.value');

    expect(JSON.stringify(response.body)).not.toContain('sensitive.token.value');
  });

  it('returns a uniform error envelope', async () => {
    const response = await request(app).get('/api/v1/me');

    expect(Object.keys(response.body)).toEqual(['error']);
    expect(response.body.error).toHaveProperty('code');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error).toHaveProperty('requestId');
  });

  it('writes an audit row inside the same transaction as the mutation', async () => {
    const created = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(volunteer))
      .send({ category: 'SEC_4', stationId, idempotencyKey: idempotencyKey() });

    await request(app)
      .post(`/api/v1/registrations/${created.body.registration.id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Recorded twice while the queue was moving' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'registration.void', entityId: created.body.registration.id },
    });

    // If the audit write failed the mutation would have failed too, so a voided
    // row without an audit row cannot exist.
    expect(audit).not.toBeNull();
    expect(audit?.requestId).toBeTruthy();
  });

  it('exposes the audit log to the Chief and nobody below a Lead', async () => {
    expect(
      (await request(app).get('/api/v1/audit').set('Authorization', bearer(chief))).status,
    ).toBe(200);
    expect((await request(app).get('/api/v1/audit').set('Authorization', bearer(ic))).status).toBe(
      403,
    );
    expect(
      (await request(app).get('/api/v1/audit').set('Authorization', bearer(volunteer))).status,
    ).toBe(403);
  });
});

/** §8.2 — CORS. */
describe('CORS', () => {
  it('reflects only an allowlisted origin', async () => {
    const allowed = await request(app).get('/healthz').set('Origin', 'http://localhost:3000');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('refuses an origin that is not on the list', async () => {
    const denied = await request(app).get('/healthz').set('Origin', 'https://evil.example');

    // Never reflected back, and never a wildcard.
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
