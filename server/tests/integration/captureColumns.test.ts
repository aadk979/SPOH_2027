import pg from 'pg';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { env } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
} from '../helpers/fixtures.js';
// @ts-expect-error -- a plain ESM script without types; its check is the oracle here.
import { checkEventOne } from '../../../remediation/reports/P09/totals.mjs';

/**
 * P09.5: captures written through the API carry the new columns — the event,
 * the recorder's membership and the category id — so the P09 totals check
 * finds nothing to flag in the tables they touch.
 */
const TOUCHED = /^(Registration|FootfallTick|AuditLog|IdempotencyRecord)\b|per category/;

beforeAll(async () => {
  await resetDatabase();
  const app = createApp();
  const { id: eventDayId } = await createEventDayToday();
  const booth = (await createStation({ code: 'BOOTH' })).id;
  const room = (await createStation({ code: 'ROOM', countsEntry: true })).id;
  const volunteer = await createVolunteer({ email: 'columns@capture.test', role: 'IC' });
  await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId: booth, eventDayId });
  await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId: room, eventDayId });
  const post = (path: string, body: object) =>
    request(app).post(path).set('Authorization', bearer(volunteer)).send(body).expect(201);

  await post('/api/v1/registrations', {
    category: 'SEC_3',
    stationId: booth,
    idempotencyKey: idempotencyKey(),
  });
  await post('/api/v1/registrations/group', {
    stationId: booth,
    idempotencyKey: idempotencyKey(),
    members: [
      { category: 'SEC_4', count: 2 },
      { category: 'PARENT_GUARDIAN', count: 1 },
    ],
  });
  await post('/api/v1/footfall/ticks', { stationId: room, idempotencyKey: idempotencyKey() });
});

describe('captures on the new columns (P09.5)', () => {
  it('leave nothing for the totals check to flag', async () => {
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      const results = (await checkEventOne(client)) as Array<{ name: string; ok: boolean }>;
      const touched = results.filter((result) => TOUCHED.test(result.name));
      expect(touched.length).toBeGreaterThan(5);
      expect(touched.filter((result) => !result.ok)).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
