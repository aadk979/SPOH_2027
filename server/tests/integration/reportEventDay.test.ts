import type { Express } from 'express';
import { zonedDayWindow } from '@spoh/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { invalidateEventCache } from '../../src/platform/event/events.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayOn,
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

beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDatabase();
  scope = await testEvent();
  chief = await createVolunteer({ role: 'CHIEF_COORDINATOR', email: 'report-day@test.invalid' });
  stationId = (await createStation({ code: 'REPORT_DAY', countsEntry: true })).id;
});

async function arrange(timezone = 'Asia/Singapore', boundary = 360, date = '2026-01-06') {
  await rawDb.event.update({
    where: { id: scope.eventId },
    data: { timezone, dayBoundaryMinutes: boundary },
  });
  invalidateEventCache();
  const day = await createEventDayOn(date, 'Selected');
  const window = zonedDayWindow(date, timezone, boundary);
  const middle = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: scope });
  const gift = await rawDb.giftType.create({
    data: { ...scope, name: 'Report gift', initialStock: 100 },
  });
  await rawDb.visitorField.create({
    data: {
      ...scope,
      code: 'marker',
      label: 'Marker',
      type: 'text',
      classification: 'visitor-personal',
      retentionDays: 2,
      readers: ['CHIEF_COORDINATOR'],
      sortOrder: 0,
    },
  });
  const times = [
    new Date(window.start.getTime() - 1),
    window.start,
    middle,
    new Date(window.end.getTime() - 1),
    window.end,
  ];
  for (const [index, recordedAt] of times.entries()) {
    const provenance = { ...scope, stationId, recordedById: chief.id, recordedAt };
    const registration = await rawDb.registration.create({
      data: { ...provenance, categoryId: category.id, idempotencyKey: idempotencyKey() },
    });
    await rawDb.visitorRecord.create({
      data: {
        ...scope,
        registrationId: registration.id,
        rehearsal: false,
        data: { marker: `day-sentinel-${index}` },
      },
    });
    await rawDb.footfallTick.create({
      data: {
        ...provenance,
        quantity: [99, 2, 3, 5, 77][index]!,
        idempotencyKey: idempotencyKey(),
      },
    });
    await rawDb.giftRedemption.create({
      data: { ...provenance, giftTypeId: gift.id, idempotencyKey: idempotencyKey() },
    });
  }
  await rawDb.fallbackWindow.create({
    data: {
      ...scope,
      tier: 3,
      declaredById: chief.id,
      reason: 'Before selected day',
      startedAt: new Date(window.start.getTime() - 60_000),
      endedAt: window.start,
    },
  });
  return { day, ...window, middle };
}

function get(path: string, query: Record<string, string> = {}) {
  return request(app)
    .get(`/api/v1/events/${scope.eventId}/reports/${path}`)
    .set('Authorization', bearer(chief))
    .query(query);
}

it.each([
  { timezone: 'Asia/Singapore', boundary: 360, date: '2026-01-06' },
  { timezone: 'Europe/London', boundary: 0, date: '2026-03-29' },
  { timezone: 'America/New_York', boundary: 360, date: '2026-01-06' },
])(
  'filters report sections on the $timezone operational day',
  async ({ timezone, boundary, date }) => {
    const { day, start, end } = await arrange(timezone, boundary, date);
    await assignToStationAllBlocks({ volunteerId: chief.id, stationId, eventDayId: day.id });
    const response = await get('summary', { eventDayId: day.id });
    expect(response.status).toBe(200);
    expect(response.body.range).toEqual({ from: start.toISOString(), to: end.toISOString() });
    expect(response.body.registrations.total).toBe(3);
    expect(response.body.footfall.total).toBe(10);
    expect(response.body.gifts.total).toBe(3);
    expect(response.body.dataIntegrity.containsFallbackData).toBe(false);
    expect(response.body.volunteers.assignments).toBe(2);
  },
);

it('intersects explicit limits and keeps the all-days query unchanged', async () => {
  const { day, middle, end } = await arrange();
  const filtered = await get('summary', {
    eventDayId: day.id,
    from: middle.toISOString(),
    to: new Date(end.getTime() + 60_000).toISOString(),
  });
  expect(filtered.status).toBe(200);
  expect(filtered.body.range).toEqual({ from: middle.toISOString(), to: end.toISOString() });
  expect(filtered.body.registrations.total).toBe(2);
  expect(filtered.body.footfall.total).toBe(8);
  expect(filtered.body.gifts.total).toBe(2);
  const all = await get('summary');
  expect(all.status).toBe(200);
  expect(all.body.range).toEqual({ from: null, to: null });
  expect(all.body.registrations.total).toBe(5);
  expect(all.body.footfall.total).toBe(186);
  expect(all.body.gifts.total).toBe(5);
  expect(all.body.dataIntegrity.containsFallbackData).toBe(true);
});

it('returns no captures, attendance or fallback overlap for an empty intersection', async () => {
  const { day, start } = await arrange();
  await assignToStationAllBlocks({ volunteerId: chief.id, stationId, eventDayId: day.id });
  const response = await get('summary', {
    eventDayId: day.id,
    to: new Date(start.getTime() - 30_000).toISOString(),
  });
  expect(response.status).toBe(200);
  expect(response.body.registrations.total).toBe(0);
  expect(response.body.footfall.total).toBe(0);
  expect(response.body.gifts.total).toBe(0);
  expect(response.body.volunteers.assignments).toBe(0);
  expect(response.body.dataIntegrity.containsFallbackData).toBe(false);
});

it.each(['summary', 'export?format=csv', 'export?format=xlsx'])(
  'refuses missing and foreign days on %s',
  async (path) => {
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const foreignEvent = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'foreign-report-day',
        name: 'Foreign',
        timezone: 'Asia/Singapore',
      },
    });
    const foreign = await rawDb.eventDay.create({
      data: { eventId: foreignEvent.id, date: new Date('2026-01-06T00:00:00Z'), label: 'Foreign' },
    });
    for (const eventDayId of ['missing-day', foreign.id]) {
      const response = await get(path, { eventDayId });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  },
);

it.each(['csv', 'xlsx'])(
  'limits %s visitor values to the report day and explicit bounds',
  async (format) => {
    const { day, middle } = await arrange();
    const response = await get('export', { format, eventDayId: day.id, from: middle.toISOString() })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    let text: string;
    if (format === 'csv') text = (response.body as Buffer).toString('utf8');
    else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body as ExcelJS.Buffer);
      text = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
    }
    expect(text).toContain('day-sentinel-2');
    expect(text).toContain('day-sentinel-3');
    for (const index of [0, 1, 4]) expect(text).not.toContain(`day-sentinel-${index}`);
  },
);
