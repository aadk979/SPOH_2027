import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * F04-008: every signed-in route is rate limited, and the public readiness
 * probe cannot be made to spend a database connection per request.
 */

const app = createApp();
let volunteer: TestVolunteer;
let assignmentId: string;

beforeEach(async () => {
  await resetDatabase();
  const day = await createEventDayToday();
  const station = await createStation({ code: 'DESK' });
  volunteer = await createVolunteer({ email: 'v@throttle.test', role: 'VOLUNTEER' });
  assignmentId = (
    await assignToStation({ volunteerId: volunteer.id, stationId: station.id, eventDayId: day.id })
  ).id;
});

describe('rate limits on signed-in routes (F04-008)', () => {
  it.each([
    ['GET', '/api/v1/me'],
    ['POST', '/api/v1/me/check-in'],
    ['POST', '/api/v1/me/check-out'],
    ['GET', '/api/v1/stations'],
  ])('%s %s answers with a rate-limit policy', async (method, path) => {
    const call =
      method === 'GET' ? request(app).get(path) : request(app).post(path).send({ assignmentId });
    const response = await call.set('Authorization', bearer(volunteer));

    expect(response.headers['ratelimit-policy']).toBeDefined();
  });
});

describe('readiness probe (F04-008)', () => {
  interface PgClient {
    query: (...args: unknown[]) => unknown;
  }
  const { Client } = createRequire(import.meta.url)('pg') as { Client: { prototype: PgClient } };
  const original = Client.prototype.query;
  let queries = 0;

  beforeAll(() => {
    Client.prototype.query = function query(this: PgClient, ...args: unknown[]) {
      queries += 1;
      return original.apply(this, args);
    };
  });

  afterAll(() => {
    Client.prototype.query = original;
  });

  it('answers a burst of probes from one recent database check', async () => {
    await request(app).get('/readyz');
    queries = 0;

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => request(app).get('/readyz')),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(queries).toBe(0);
  });
});
