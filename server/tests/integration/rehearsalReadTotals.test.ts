import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { RegistrationSummaryResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let stationId: string;
let admin: TestVolunteer;
const phase = (status: 'LIVE' | 'REHEARSAL') =>
  rawDb.event.update({ where: { id: eventId }, data: { status } });
const post = (path: string, data: Record<string, unknown>) =>
  request(app)
    .post(`/api/v1/events/${eventId}/${path}`)
    .set('Authorization', bearer(admin))
    .send({ idempotencyKey: idempotencyKey(), stationId, ...data });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'admin@practice-counts.test', role: 'ADMIN' });
  stationId = (await createStation({ code: 'TOTALS', countsEntry: true })).id;
});

describe('capture totals and registration summary provenance', () => {
  it('keeps single/group registration totals separate through a phase change', async () => {
    expect((await post('registrations', { category: 'SEC_4' })).status).toBe(201);
    await phase('REHEARSAL');
    const practice = await post('registrations', { category: 'SEC_4', rehearsal: true });
    expect(practice.status).toBe(201);
    expect(practice.body).toMatchObject({ sessionTotal: 1, boothTotal: 1 });
    const group = await post('registrations/group', {
      members: [{ category: 'OTHER', count: 3 }],
      rehearsal: true,
    });
    expect(group.status).toBe(201);
    expect(group.body.boothTotal).toBe(4);
    await phase('LIVE');
    const live = await post('registrations', { category: 'SEC_4', rehearsal: false });
    expect(live.status).toBe(201);
    expect(live.body).toMatchObject({ sessionTotal: 2, boothTotal: 2 });
  });

  it('keeps tap and bulk footfall totals separate through a phase change', async () => {
    const bulk = {
      quantity: 2,
      source: 'PAPER',
      timeBlockStart: FROZEN_NOW.toISOString(),
      reason: 'Test clicker count',
    };
    expect((await post('footfall/bulk', bulk)).status).toBe(201);
    await phase('REHEARSAL');
    const practice = await post('footfall/ticks', { rehearsal: true });
    expect(practice.status).toBe(201);
    expect(practice.body).toMatchObject({ sessionTotal: 1, stationTotal: 1 });
    const practiceBulk = await post('footfall/bulk', { ...bulk, quantity: 7, rehearsal: true });
    expect(practiceBulk.status).toBe(201);
    expect(practiceBulk.body).toMatchObject({ sessionTotal: 8, stationTotal: 8 });
    await phase('LIVE');
    const live = await post('footfall/ticks', { rehearsal: false });
    expect(live.status).toBe(201);
    expect(live.body).toMatchObject({ sessionTotal: 3, stationTotal: 3 });
  });

  it.each(['category', 'hour', 'day'])(
    'filters %s summaries and labels explicit inclusion',
    async (groupBy) => {
      await post('registrations', { category: 'SEC_4' });
      await phase('REHEARSAL');
      await post('registrations/group', {
        members: [{ category: 'OTHER', count: 3 }],
        rehearsal: true,
      });
      await rawDb.fallbackWindow.create({
        data: {
          eventId,
          rehearsal: true,
          declaredById: admin.id,
          tier: 4,
          reason: 'Practice',
          startedAt: FROZEN_NOW,
        },
      });
      const get = (selection = '') =>
        request(app)
          .get(`/api/v1/events/${eventId}/registrations/summary?groupBy=${groupBy}${selection}`)
          .set('Authorization', bearer(admin));
      for (const status of ['REHEARSAL', 'LIVE'] as const) {
        await phase(status);
        const response = await get();
        expect(response.status).toBe(200);
        const summary = RegistrationSummaryResponse.parse(response.body);
        expect(summary).toMatchObject({
          rehearsalIncluded: false,
          total: 1,
          containsFallbackData: false,
        });
        expect(summary.buckets.reduce((sum, row) => sum + row.value, 0)).toBe(1);
      }
      const included = RegistrationSummaryResponse.parse(
        (await get('&includeRehearsal=true')).body,
      );
      expect(included).toMatchObject({
        rehearsalIncluded: true,
        total: 4,
        containsFallbackData: true,
      });
      expect(included.buckets.reduce((sum, row) => sum + row.value, 0)).toBe(4);
      expect((await get('&includeRehearsal=false')).body.total).toBe(1);
      expect((await get('&includeRehearsal=invalid')).status).toBe(400);
    },
  );
});
