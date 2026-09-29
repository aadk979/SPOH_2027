import { createRequire } from 'node:module';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app/createApp.js';
import { resetDatabase, rawDb } from '../../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
  testEvent,
} from '../../helpers/fixtures.js';

/**
 * F03-019: queries issued concurrently on one transaction's connection.
 *
 * Prisma loads an `include`'s relations in parallel; inside `$transaction`
 * that is one pg client, which pg@8 queues with a once-per-process warning and
 * pg@9 refuses. The warning fires once per process, so it would only name the
 * first offender: instead each test counts the queries a route issues while
 * its connection is already busy.
 */

interface PgClient {
  activeQuery: unknown;
  _queryQueue: unknown[];
  query: (...args: unknown[]) => unknown;
}

const { Client } = createRequire(import.meta.url)('pg') as {
  Client: { prototype: PgClient };
};
const original = Client.prototype.query;
let overlaps = 0;

beforeAll(() => {
  Client.prototype.query = function query(this: PgClient, ...args: unknown[]) {
    if (this.activeQuery || this._queryQueue.length > 0) overlaps += 1;
    return original.apply(this, args);
  };
});

afterAll(() => {
  Client.prototype.query = original;
});

let app: Express;
let owner: TestVolunteer;
let target: TestVolunteer;
let chief: TestVolunteer;
let admin: TestVolunteer;
let dayId: string;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'DESK' })).id;
  owner = await createVolunteer({ email: 'owner@tx.test', role: 'VOLUNTEER' });
  target = await createVolunteer({ email: 'target@tx.test', role: 'VOLUNTEER' });
  chief = await createVolunteer({ email: 'chief@tx.test', role: 'CHIEF_COORDINATOR' });
  admin = await createVolunteer({ email: 'admin@tx.test', role: 'ADMIN' });
});

async function overlapsDuring(call: () => Promise<request.Response>): Promise<number> {
  overlaps = 0;
  const response = await call();
  expect(response.status).toBeLessThan(300);
  return overlaps;
}

describe('no overlapping queries on a transaction connection (F03-019)', () => {
  it('deciding a swap', async () => {
    const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: dayId });
    const asked = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(owner))
      .send({ assignmentId: shift.id, targetVolunteerId: target.id });

    expect(
      await overlapsDuring(() =>
        request(app)
          .post(`/api/v1/roster/swaps/${asked.body.swap.id as string}/decide`)
          .set('Authorization', bearer(chief))
          .send({ decision: 'APPROVED' }),
      ),
    ).toBe(0);
  });

  it('asking for a swap', async () => {
    const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: dayId });
    expect(
      await overlapsDuring(() =>
        request(app)
          .post('/api/v1/roster/swaps')
          .set('Authorization', bearer(owner))
          .send({ assignmentId: shift.id, targetVolunteerId: target.id }),
      ),
    ).toBe(0);
  });

  it('rostering someone', async () => {
    expect(
      await overlapsDuring(() =>
        request(app)
          .post('/api/v1/admin/assignments')
          .set('Authorization', bearer(chief))
          .send({ volunteerId: target.id, stationId, eventDayId: dayId, block: 'AFTERNOON' }),
      ),
    ).toBe(0);
  });

  it('reporting an incident', async () => {
    expect(
      await overlapsDuring(() =>
        request(app).post('/api/v1/incidents').set('Authorization', bearer(owner)).send({
          idempotencyKey: idempotencyKey(),
          type: 'NEAR_MISS',
          severity: 'LOW',
          description: 'Cable across the walkway',
          occurredAt: new Date().toISOString(),
        }),
      ),
    ).toBe(0);
  });

  it('raising a lost-person alert', async () => {
    expect(
      await overlapsDuring(() =>
        request(app)
          .post('/api/v1/lost-person')
          .set('Authorization', bearer(owner))
          .send({ idempotencyKey: idempotencyKey(), descriptionText: 'Child, red cap' }),
      ),
    ).toBe(0);
  });

  it('checking in and out of a shift', async () => {
    const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: dayId });
    await rawDb.attendance.create({
      data: {
        eventId: (await testEvent()).eventId,
        volunteerId: owner.id,
        eventDayId: dayId,
        method: 'ROOT',
        presentAt: new Date(),
      },
    });
    const call = (path: string) => () =>
      request(app)
        .post(`/api/v1/me/${path}`)
        .set('Authorization', bearer(owner))
        .send({ assignmentId: shift.id });

    expect(await overlapsDuring(call('check-in'))).toBe(0);
    expect(await overlapsDuring(call('check-out'))).toBe(0);
  });

  it('editing a volunteer', async () => {
    expect(
      await overlapsDuring(() =>
        request(app)
          .patch(`/api/v1/admin/volunteers/${target.id}`)
          .set('Authorization', bearer(admin))
          .send({ displayName: 'Renamed' }),
      ),
    ).toBe(0);
  });
});
