import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { logger } from '../../src/platform/logger/index.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { useAuthorizer } from '../../src/platform/http/authorize.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * The policies decide (P11.5 release 2): what a refusal looks like, where it is recorded, and
 * what happens when the policies cannot answer or have nothing to ask about.
 */
let app: Express;
let volunteer: TestVolunteer;
let deputy: TestVolunteer;

const denials = async () => {
  await settleDenials();
  return rawDb.auditLog.findMany({
    where: { action: 'authorization.denied' },
    orderBy: { createdAt: 'asc' },
  });
};

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  await testEvent();
  volunteer = await createVolunteer({ email: 'v@enforce.test', role: 'VOLUNTEER' });
  deputy = await createVolunteer({ email: 'd@enforce.test', role: 'DEPUTY_COORDINATOR' });
});

afterEach(() => {
  useAuthorizer(null);
  vi.restoreAllMocks();
});

const auditAs = (who: TestVolunteer) =>
  request(app).get('/api/v1/audit').set('Authorization', bearer(who));

describe('a refusal', () => {
  it('is a 403 recorded in the security audit with the action and the deciding policies', async () => {
    const response = await auditAs(volunteer);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const [row, ...rest] = await denials();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      actorId: volunteer.id,
      severity: 'WARNING',
      outcome: 'DENIED',
      entityType: 'Route',
      method: 'GET',
      statusCode: 403,
      after: { actions: ['Audit.Read'], policies: [] },
    });
    expect(row!.path).toMatch(/\/audit$/);
    expect(row!.entityId).toBe(`GET ${row!.path}`);
  });

  it('collapses a caller polling a refused route into one row a minute', async () => {
    for (let i = 0; i < 5; i++) expect((await auditAs(volunteer)).status).toBe(403);
    expect(await denials()).toHaveLength(1);
  });

  it('does not record what was allowed', async () => {
    const chief = await createVolunteer({ email: 'c@enforce.test', role: 'CHIEF_COORDINATOR' });
    expect((await auditAs(chief)).status).toBe(200);
    expect(await denials()).toEqual([]);
  });
});

describe('when the policies cannot answer', () => {
  it('fails closed with a 503 that blames nobody, and records no denial', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    useAuthorizer({
      isAuthorized: () => Promise.reject(new Error('engine down')),
      batch: () => Promise.reject(new Error('engine down')),
    });
    const response = await request(app).get('/api/v1/me').set('Authorization', bearer(deputy));
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await denials()).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ route: expect.stringContaining('/me') }),
      'authorization evaluation failed',
    );
  });
});

describe('with nothing to ask about', () => {
  // An empty swap queue has no request to ask Swap.Decide of: the role's grant answers.
  it('lets a role the event grants the action see the empty queue', async () => {
    const response = await request(app)
      .get('/api/v1/roster/swaps/pending')
      .set('Authorization', bearer(deputy));
    expect(response.status).toBe(200);
  });

  it('refuses a role the event does not grant it', async () => {
    const response = await request(app)
      .get('/api/v1/roster/swaps/pending')
      .set('Authorization', bearer(volunteer));
    expect(response.status).toBe(403);
  });

  it('follows the event’s own grants rather than the defaults', async () => {
    const { eventId } = await testEvent();
    await rawDb.rolePermission.deleteMany({
      where: { eventId, role: 'DEPUTY_COORDINATOR', action: 'Swap.Decide' },
    });
    const response = await request(app)
      .get('/api/v1/roster/swaps/pending')
      .set('Authorization', bearer(deputy));
    expect(response.status).toBe(403);
  });
});

describe('a refusal the use case explains', () => {
  it('leaves an archived event’s capture to its admission, which says why', async () => {
    const { eventId } = await testEvent();
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    const station = await createStation({ code: 'ARCHIVED_DOOR', countsEntry: true });
    // On shift there, so the event's phase is the only thing in the way.
    const day = await createEventDayToday();
    await assignToStationAllBlocks({
      volunteerId: volunteer.id,
      stationId: station.id,
      eventDayId: day.id,
    });
    const response = await request(app)
      .post(`/api/v1/events/${eventId}/footfall/ticks`)
      .set('Authorization', bearer(volunteer))
      .send({ stationId: station.id, idempotencyKey: crypto.randomUUID() });
    expect(response.status).toBe(409);
    expect(await rawDb.footfallTick.count({ where: { eventId } })).toBe(0);
    expect(await denials()).toEqual([]);
  });
});
