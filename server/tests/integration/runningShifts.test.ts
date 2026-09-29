import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
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
  await assignToStation({ volunteerId: booth.id, stationId, eventDayId, block: 'MORNING' });
});

async function moveMorningShift(window: { startsAt: Date; endsAt: Date }): Promise<void> {
  const { eventId } = await testEvent();
  await prisma.shift.updateMany({
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
