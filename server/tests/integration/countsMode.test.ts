import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  categoryId,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * The mode tests for `countsMode` (ADR-002 §4 and "How it is tested", P09.14).
 * With `separate`, no response carries a headline or any combined figure.
 * With `headline`, the headline is always the chosen source's own count, and
 * all three counts are always beside it, in the report, its exports and the
 * live dashboard.
 */

let app: Express;
let chief: TestVolunteer;
let door: string;
let hall: string;

/** A minute before the frozen now: inside today's live window, which ends at now. */
const AT = new Date(FROZEN_NOW.getTime() - 60_000);

beforeAll(() => {
  app = createApp();
});

/** Registrations 3, entries 5 at the door and 2 in the hall, journeys 4: all different. */
beforeEach(async () => {
  await resetDatabase();
  await createEventDayToday();
  chief = await createVolunteer({ email: 'chief@counts.test', role: 'CHIEF_COORDINATOR' });
  door = (await createStation({ code: 'DOOR', name: 'Front door', countsEntry: true })).id;
  hall = (await createStation({ code: 'HALL', name: 'Hall', countsEntry: true })).id;
  const { eventId } = await testEvent();
  const base = { eventId, recordedById: chief.id, recordedAt: AT };
  const sec1 = await categoryId('SEC_1');
  for (let i = 0; i < 3; i += 1) {
    await rawDb.registration.create({
      data: { ...base, stationId: door, categoryId: sec1, idempotencyKey: idempotencyKey() },
    });
  }
  for (const [stationId, count] of [
    [door, 5],
    [hall, 2],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      await rawDb.footfallTick.create({
        data: { ...base, stationId, idempotencyKey: idempotencyKey() },
      });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    await rawDb.missionCard.create({
      data: {
        eventId,
        shortCode: `CNT00${i}`,
        qrPayload: `counts-${i}`,
        status: 'ISSUED',
        issuedAt: AT,
      },
    });
  }
});

const get = (path: string) =>
  request(app).get(`/api/v1${path}`).set('Authorization', bearer(chief));

async function setCounts(value: object): Promise<void> {
  const current = await get('/admin/event-settings');
  const response = await request(app)
    .patch('/api/v1/admin/event-settings')
    .set('Authorization', bearer(chief))
    .send({
      key: 'product.countsMode',
      value,
      expectedVersion: current.body.versions['product.countsMode'],
    });
  expect(response.status).toBe(200);
}

/** Every key anywhere in a response body. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

describe('countsMode: separate (the default)', () => {
  it('gives no headline and no combined figure anywhere', async () => {
    const report = await get('/reports/summary');
    const live = await get('/dashboard/live');
    const csv = await get('/reports/export?format=csv');

    expect(report.body.headline).toBeNull();
    expect(live.body.headline).toBeNull();
    expect(csv.text).not.toContain('Headline');
    for (const body of [report.body, live.body]) {
      expect(keysOf(body).filter((key) => /combined|grand|visitorTotal/i.test(key))).toEqual([]);
    }
  });
});

describe('countsMode: headline', () => {
  it.each([
    ['registrations', { count: 'registrations' }, 3, 'from registrations'],
    ['journeys', { count: 'journeys' }, 4, 'from card journeys'],
  ])('takes the headline from %s alone', async (_name, source, value, label) => {
    await setCounts({ mode: 'headline', source });
    const report = await get('/reports/summary');
    const live = await get('/dashboard/live');

    expect(report.body.headline).toMatchObject({ source, value, sourceLabel: label });
    expect(live.body.headline).toMatchObject({ source, value });
    // Always beside the three counts, never instead of them.
    expect(report.body.registrations.total).toBe(3);
    expect(report.body.footfall.total).toBe(7);
    expect(report.body.cards.issued).toBe(4);
    expect(live.body.registrations.todayTotal).toBe(3);
    expect(live.body.footfall.todayTotal).toBe(7);
    expect(live.body.cards.issued).toBe(4);
  });

  it("takes a footfall headline from the chosen station's entries, not every station's", async () => {
    await setCounts({ mode: 'headline', source: { count: 'footfall', stationId: door } });
    const report = await get('/reports/summary');
    const live = await get('/dashboard/live');

    expect(report.body.headline).toMatchObject({
      value: 5,
      sourceLabel: 'from entries counted at Front door',
    });
    expect(live.body.headline.value).toBe(5);
    expect(report.body.footfall.total).toBe(7);
  });

  it('heads the exports with the headline, saying it is not a sum', async () => {
    await setCounts({ mode: 'headline', source: { count: 'registrations' } });
    const csv = await get('/reports/export?format=csv');
    expect(csv.text).toContain('# Headline: 3; from registrations. It is one of the three');
  });
});
