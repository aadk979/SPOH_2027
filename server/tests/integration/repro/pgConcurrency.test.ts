import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproduction: queries issued concurrently on one transaction's
 * connection (PF-20). The source is Prisma's query interpreter, not our code:
 * it loads an `include`'s relations in parallel, which inside `$transaction`
 * means one pg client. pg warns once per process and pg@9 makes it an error,
 * so this file holds this test alone and listens from the first query on.
 */

const app = createApp();
const warnings: string[] = [];
const onWarning = (warning: Error): void => {
  warnings.push(warning.message);
};

beforeEach(async () => {
  await resetDatabase();
  process.on('warning', onWarning);
});

afterEach(() => {
  process.off('warning', onWarning);
});

describe('transactions (P03 repros)', () => {
  // F03-019
  it.skip('never runs two queries at once on a transaction client', async () => {
    const day = await createEventDayToday();
    const station = await createStation({ code: 'DESK' });
    const owner = await createVolunteer({ email: 'owner@pg.test', role: 'VOLUNTEER' });
    const target = await createVolunteer({ email: 'target@pg.test', role: 'VOLUNTEER' });
    const shift = await assignToStation({
      volunteerId: owner.id,
      stationId: station.id,
      eventDayId: day.id,
    });

    // requestSwap creates the swap inside a transaction with an `include` of
    // four relations, which Prisma's query interpreter loads in parallel on
    // the transaction's single connection.
    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(owner))
      .send({ assignmentId: shift.id, targetVolunteerId: target.id });
    expect(response.status).toBe(201);

    // The warning is emitted on the next tick.
    await new Promise((resolve) => setImmediate(resolve));
    expect(warnings.filter((message) => message.includes('already executing a query'))).toEqual([]);
  });
});
