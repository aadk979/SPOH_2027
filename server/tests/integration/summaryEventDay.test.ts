import type { Express } from 'express';
import { zonedDayWindow } from '@spoh/shared';
import request from 'supertest';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { invalidateEventCache } from '../../src/platform/event/events.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

let app: Express;
let scope: EventScope;
let chief: TestVolunteer;
let stationId: string;
let giftTypeId: string;
let categoryId: string;
const summaries = [
  { path: 'registrations/summary', selected: 3, clipped: 2, all: 5, unit: 'registrations' },
  { path: 'footfall/summary', selected: 10, clipped: 8, all: 186, unit: 'roomEntries' },
  { path: 'gifts/summary', selected: 3, clipped: 2, all: 5, unit: 'redemptions' },
];

beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDatabase();
  scope = await testEvent();
  chief = await createVolunteer({ role: 'CHIEF_COORDINATOR', email: 'summary-day@test.invalid' });
  stationId = (await createStation({ code: 'DAY', name: 'Day counts', countsEntry: true })).id;
  giftTypeId = (
    await rawDb.giftType.create({ data: { ...scope, name: 'Day gift', initialStock: 100 } })
  ).id;
  categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: scope })).id;
});

async function arrangeDay(timezone = 'Asia/Singapore', boundary = 360, date = '2026-01-06') {
  await rawDb.event.update({
    where: { id: scope.eventId },
    data: { timezone, dayBoundaryMinutes: boundary },
  });
  invalidateEventCache();
  const day = await rawDb.eventDay.create({
    data: { ...scope, date: new Date(`${date}T00:00:00Z`), label: 'Selected day' },
  });
  const window = zonedDayWindow(date, timezone, boundary);
  const middle = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const times = [
    new Date(window.start.getTime() - 1),
    window.start,
    middle,
    new Date(window.end.getTime() - 1),
    window.end,
  ];
  for (const [index, recordedAt] of times.entries()) {
    const provenance = { ...scope, stationId, recordedById: chief.id, recordedAt };
    await rawDb.registration.create({
      data: { ...provenance, categoryId, idempotencyKey: idempotencyKey() },
    });
    await rawDb.footfallTick.create({
      data: {
        ...provenance,
        quantity: [99, 2, 3, 5, 77][index]!,
        idempotencyKey: idempotencyKey(),
      },
    });
    await rawDb.giftRedemption.create({
      data: { ...provenance, giftTypeId, idempotencyKey: idempotencyKey() },
    });
  }
  await rawDb.fallbackWindow.create({
    data: {
      ...scope,
      tier: 3,
      declaredById: chief.id,
      reason: 'Previous day only',
      startedAt: new Date(window.start.getTime() - 60_000),
      endedAt: window.start,
    },
  });
  return { day, ...window, middle };
}

function summary(path: string, query: Record<string, string>) {
  return request(app)
    .get(`/api/v1/events/${scope.eventId}/${path}`)
    .set('Authorization', bearer(chief))
    .query(query);
}

it.each([
  { timezone: 'Asia/Singapore', boundary: 360, date: '2026-01-06', hours: 24 },
  { timezone: 'Europe/London', boundary: 0, date: '2026-03-29', hours: 23 },
])(
  'uses the $timezone operational day for every count and fallback flag',
  async ({ timezone, boundary, date, hours }) => {
    const { day, start, end } = await arrangeDay(timezone, boundary, date);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(hours);
    for (const target of summaries) {
      const response = await summary(target.path, { eventDayId: day.id });
      expect(response.status).toBe(200);
      expect(response.body.unit).toBe(target.unit);
      expect(response.body.total).toBe(target.selected);
      expect(response.body.containsFallbackData).toBe(false);
      if (target.path === 'footfall/summary')
        expect(response.body.stations[0].total).toBe(target.selected);
      if (target.path === 'registrations/summary')
        expect(response.body.buckets[0].value).toBe(target.selected);
      if (target.path === 'gifts/summary')
        expect(response.body.byGiftType[0].redeemed).toBe(target.selected);
    }
  },
);

it.each(summaries)('intersects explicit bounds with the selected day for $path', async (target) => {
  const { day, middle, end } = await arrangeDay();
  const response = await summary(target.path, {
    eventDayId: day.id,
    from: middle.toISOString(),
    to: new Date(end.getTime() + 60_000).toISOString(),
  });
  expect(response.status).toBe(200);
  expect(response.body.total).toBe(target.clipped);
});

it.each(summaries)(
  'refuses missing and foreign event-day identifiers for $path',
  async (target) => {
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const other = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'other-summary-event',
        name: 'Other event',
        timezone: 'Asia/Singapore',
      },
    });
    const foreign = await rawDb.eventDay.create({
      data: { eventId: other.id, date: new Date('2026-01-06T00:00:00Z'), label: 'Foreign' },
    });
    for (const eventDayId of ['missing-day', foreign.id]) {
      const response = await summary(target.path, { eventDayId });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  },
);

it.each(summaries)(
  'returns no counts or fallback overlap for an empty selected range on $path',
  async (target) => {
    const { day, start } = await arrangeDay();
    const to = new Date(start.getTime() - 30_000);
    const response = await summary(target.path, { eventDayId: day.id, to: to.toISOString() });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
    expect(response.body.containsFallbackData).toBe(false);
  },
);

it.each(summaries)(
  'preserves the all-days query when eventDayId is omitted for $path',
  async (target) => {
    await arrangeDay();
    const response = await summary(target.path, {});
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(target.all);
    expect(response.body.containsFallbackData).toBe(true);
  },
);
