import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LiveDashboardResponse,
  StationDashboardResponse,
  DataHealthResponse,
  CardFunnelResponse,
  FootfallSummaryResponse,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let stationId: string;
let admin: TestVolunteer;
const ago = (minutes: number) => new Date(FROZEN_NOW.getTime() - minutes * 60_000);
const get = (path: string) =>
  request(app).get(`/api/v1/events/${eventId}/${path}`).set('Authorization', bearer(admin));

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  const day = await createEventDayToday();
  admin = await createVolunteer({ email: 'admin@practice-dashboard.test', role: 'ADMIN' });
  stationId = (await createStation({ code: 'DASH', countsEntry: true, issuesStamp: true })).id;
  const assignment = await assignToStation({
    volunteerId: admin.id,
    eventDayId: day.id,
    stationId,
  });
  await rawDb.shiftAssignment.update({
    where: { eventId, id: assignment.id },
    data: { checkedInAt: ago(60) },
  });
  const category = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId, code: 'SEC_4' },
  });
  const gift = await rawDb.giftType.create({
    data: { eventId, name: 'Badge', initialStock: 10, rehearsalInitialStock: 3 },
  });
  for (const rehearsal of [false, true]) {
    const mode = rehearsal ? 'practice' : 'live';
    const scope = { eventId, rehearsal };
    const recorder = { recordedById: admin.id, recordedAt: ago(rehearsal ? 5 : 40) };
    await rawDb.registration.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        categoryId: category.id,
        idempotencyKey: `registration-${mode}`,
        source: 'APP',
      },
    });
    await rawDb.footfallTick.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        quantity: rehearsal ? 7 : 2,
        idempotencyKey: `footfall-${mode}`,
        source: 'APP',
      },
    });
    const card = await rawDb.missionCard.create({
      data: {
        ...scope,
        shortCode: rehearsal ? 'ABC234' : 'DEF234',
        qrPayload: mode,
        status: 'COMPLETED',
        issuedAt: recorder.recordedAt,
        completedAt: recorder.recordedAt,
      },
    });
    await rawDb.cardStampEvent.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        missionCardId: card.id,
        idempotencyKey: `stamp-${mode}`,
        source: 'APP',
      },
    });
    if (rehearsal) {
      await rawDb.giftRedemption.create({
        data: {
          ...scope,
          ...recorder,
          stationId,
          missionCardId: card.id,
          giftTypeId: gift.id,
          source: 'APP',
          flag: 'OVER_STOCK',
          idempotencyKey: 'practice-gift',
        },
      });
      await rawDb.incident.create({
        data: {
          ...scope,
          stationId,
          reportedById: admin.id,
          type: 'OTHER',
          severity: 'CRITICAL',
          description: 'Practice incident',
          idempotencyKey: 'practice-incident',
          occurredAt: recorder.recordedAt,
          reportedAt: recorder.recordedAt,
        },
      });
      await rawDb.lostPersonAlert.create({
        data: {
          ...scope,
          raisedById: admin.id,
          raisedAt: recorder.recordedAt,
          descriptionText: 'Practice description',
        },
      });
      await rawDb.fallbackWindow.create({
        data: {
          ...scope,
          declaredById: admin.id,
          tier: 4,
          reason: 'Practice window',
          startedAt: recorder.recordedAt,
        },
      });
    }
  }
});

describe('dashboard provenance', () => {
  it.each(['LIVE', 'REHEARSAL'] as const)('defaults to live rows in %s', async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    const response = await get('dashboard/live');
    expect(response.status).toBe(200);
    const dashboard = LiveDashboardResponse.parse(response.body);
    expect(dashboard.rehearsalIncluded).toBe(false);
    expect(dashboard.registrations.todayTotal).toBe(1);
    expect(dashboard.footfall.todayTotal).toBe(2);
    expect(dashboard.cards).toMatchObject({ issued: 1, completed: 1, redeemed: 0 });
    expect(dashboard.gifts).toEqual([expect.objectContaining({ rehearsal: false, remaining: 10 })]);
    expect(dashboard.safety).toEqual({
      openIncidents: 0,
      criticalIncidents: 0,
      activeLostPersonAlerts: 0,
    });
    expect(dashboard.dataHealth).toMatchObject({
      fallbackWindowOpen: false,
      flaggedRedemptions: [],
    });
    expect(dashboard.dataHealth.silentStations).toEqual([
      expect.objectContaining({ stationId, lastActivityAt: ago(40).toISOString() }),
    ]);
    expect(dashboard.dataHealth.staleDevices).toEqual([
      expect.objectContaining({ volunteerId: admin.id, lastCaptureAt: ago(40).toISOString() }),
    ]);
    const station = StationDashboardResponse.parse(
      (await get(`dashboard/station/${stationId}`)).body,
    );
    expect(station).toMatchObject({ rehearsalIncluded: false, stamps: 1, flaggedRedemptions: [] });
    expect(station.registrations).toMatchObject({
      todayTotal: 1,
      byDevice: [expect.objectContaining({ value: 1 })],
    });
    expect(station.footfall).toMatchObject({
      todayTotal: 2,
      lastActivityAt: ago(40).toISOString(),
    });
    expect((await get('dashboard/live?includeRehearsal=false')).body.registrations.todayTotal).toBe(
      1,
    );
  });

  it('includes practice only when selected, including health signals and separate stock', async () => {
    const dashboard = LiveDashboardResponse.parse(
      (await get('dashboard/live?includeRehearsal=true')).body,
    );
    expect(dashboard.rehearsalIncluded).toBe(true);
    expect(dashboard.registrations).toMatchObject({ todayTotal: 2, lastHour: 2 });
    expect(dashboard.footfall.todayTotal).toBe(9);
    expect(dashboard.cards).toMatchObject({ issued: 2, completed: 2, redeemed: 1 });
    expect(dashboard.cards.stages.find((stage) => stage.key === 'DASH')?.value).toBe(2);
    expect(dashboard.gifts).toEqual([
      expect.objectContaining({ rehearsal: false, remaining: 10 }),
      expect.objectContaining({ rehearsal: true, remaining: 2 }),
    ]);
    expect(dashboard.safety).toEqual({
      openIncidents: 1,
      criticalIncidents: 1,
      activeLostPersonAlerts: 1,
    });
    expect(dashboard.dataHealth).toMatchObject({
      rehearsalIncluded: true,
      fallbackWindowOpen: true,
      silentStations: [],
      staleDevices: [],
    });
    expect(dashboard.dataHealth.flaggedRedemptions).toHaveLength(1);
    const health = DataHealthResponse.parse(
      (await get('dashboard/data-health?includeRehearsal=true')).body,
    );
    expect(health).toMatchObject({ rehearsalIncluded: true, fallbackWindowOpen: true });
    const station = StationDashboardResponse.parse(
      (await get(`dashboard/station/${stationId}?includeRehearsal=true`)).body,
    );
    expect(station).toMatchObject({ rehearsalIncluded: true, stamps: 2 });
    expect(station.registrations.todayTotal).toBe(2);
    expect(station.footfall).toMatchObject({ todayTotal: 9, lastActivityAt: ago(5).toISOString() });
    expect(station.flaggedRedemptions).toHaveLength(1);
  });

  it('filters the footfall and card summary endpoints and rejects malformed selection', async () => {
    const footfall = FootfallSummaryResponse.parse((await get('footfall/summary')).body);
    expect(footfall).toMatchObject({
      rehearsalIncluded: false,
      total: 2,
      containsFallbackData: false,
    });
    const all = FootfallSummaryResponse.parse(
      (await get('footfall/summary?includeRehearsal=true')).body,
    );
    expect(all).toMatchObject({ rehearsalIncluded: true, total: 9, containsFallbackData: true });
    expect((await get('footfall/live')).body.stations[0].todayTotal).toBe(2);
    expect((await get('footfall/live?includeRehearsal=true')).body.stations[0].todayTotal).toBe(9);
    const cards = CardFunnelResponse.parse((await get('cards/funnel')).body);
    expect(cards).toMatchObject({
      rehearsalIncluded: false,
      issued: 1,
      redeemed: 0,
      containsFallbackData: false,
    });
    const allCards = CardFunnelResponse.parse(
      (await get('cards/funnel?includeRehearsal=true')).body,
    );
    expect(allCards).toMatchObject({
      rehearsalIncluded: true,
      issued: 2,
      redeemed: 1,
      containsFallbackData: true,
    });
    for (const path of [
      'dashboard/live',
      'dashboard/data-health',
      `dashboard/station/${stationId}`,
      'footfall/live',
      'footfall/summary',
      'cards/funnel',
    ]) {
      expect((await get(`${path}?includeRehearsal=garbage`)).status).toBe(400);
    }
  });
});
