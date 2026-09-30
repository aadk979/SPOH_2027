import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
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
 * P09.10: a registration's category is one of the event's own, by code
 * (ADR-002). The booth reads them from the event; a code the event lacks is
 * a category that does not exist.
 */

let app: Express;
let booth: TestVolunteer;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  const dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'BOOTH' })).id;
  booth = await createVolunteer({ email: 'booth@categories.test', role: 'VOLUNTEER' });
  await assignToStationAllBlocks({ volunteerId: booth.id, stationId, eventDayId: dayId });
});

const tap = (category: string) =>
  request(app)
    .post('/api/v1/registrations')
    .set('Authorization', bearer(booth))
    .send({ category, stationId, idempotencyKey: idempotencyKey() });

describe('capture categories (P09.10)', () => {
  it("lists the event's active categories in the booth's order", async () => {
    const { eventId } = await testEvent();
    await rawDb.captureCategory.update({
      where: { eventId_code: { eventId, code: 'OTHER' } },
      data: { active: false },
    });
    const response = await request(app)
      .get('/api/v1/registrations/categories')
      .set('Authorization', bearer(booth));
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { code: string }) => row.code)).toEqual([
      'SEC_1',
      'SEC_2',
      'SEC_3',
      'SEC_4',
      'SEC_5',
      'GRADUATED_AWAITING_RESULTS',
      'PARENT_GUARDIAN',
    ]);
    expect(response.body.data[5].label).toBe('Graduated, awaiting results');
  });

  it("records a tap in the event's category and returns its label", async () => {
    const response = await tap('SEC_4');
    expect(response.status).toBe(201);
    expect(response.body.registration).toMatchObject({ category: 'SEC_4', categoryLabel: 'Sec 4' });
  });

  it('refuses a code the event does not have, and counts nothing', async () => {
    const response = await tap('SEC_9');
    expect(response.status).toBe(404);
    expect(await rawDb.registration.count()).toBe(0);
  });
});
