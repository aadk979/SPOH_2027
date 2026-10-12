import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app/createApp.js';
import { StationDashboardResponse } from '@spoh/shared';
import { claimDueDeliveries } from '../../../src/modules/announcement/application/claimDueDeliveries.js';
import { executeClaimedDelivery } from '../../../src/modules/announcement/application/executeClaimedDelivery.js';
import type { DevicePushInput, DevicePushResult } from '../../../src/modules/notification/index.js';
import { fixedClock } from '../../../src/platform/time/index.js';
import { resetDatabase, rawDb } from '../../helpers/db.js';
import { FROZEN_NOW } from '../../setup.js';
import {
  assignToStation,
  bearer,
  categoryId,
  createEventDayOn,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: numbers the committee reads (live dashboard, report,
 * imports) and who an announcement reaches. Skipped until fixed; each asserts
 * the correct behaviour and fails today. Clock: 11:30 Singapore, 7 Jan 2027.
 */

let app: Express;
let chief: TestVolunteer;
let volunteer: TestVolunteer;
let dayId: string;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'DESK' })).id;
  chief = await createVolunteer({ email: 'chief@numbers.test', role: 'CHIEF_COORDINATOR' });
  volunteer = await createVolunteer({ email: 'v@numbers.test', role: 'VOLUNTEER' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function registrationAt(recordedAt: string): Promise<void> {
  await rawDb.registration.create({
    data: {
      eventId: (await testEvent()).eventId,
      categoryId: await categoryId('SEC_3'),
      stationId,
      recordedById: volunteer.id,
      recordedAt: new Date(recordedAt),
      source: 'FALLBACK_SHEET',
      idempotencyKey: `repro:${recordedAt}`,
    },
  });
}

function liveDashboard(): request.Test {
  return request(app).get('/api/v1/dashboard/live').set('Authorization', bearer(chief));
}

describe('dashboard, report and import numbers (P03 repros)', () => {
  // F02-006
  it('leaves rows dated tomorrow out of today and the last hour', async () => {
    await registrationAt('2027-01-07T03:00:00.000Z'); // 11:00 today
    await registrationAt('2027-01-08T03:00:00.000Z'); // 11:00 tomorrow

    const response = await liveDashboard();
    expect(response.status).toBe(200);
    expect(response.body.registrations.todayTotal).toBe(1);
    expect(response.body.registrations.lastHour).toBe(1);
  });

  // F03-013
  it.skip('counts a registration made at 07:00 local time as today', async () => {
    await registrationAt('2027-01-06T23:00:00.000Z'); // 07:00 on 7 Jan in Singapore

    const response = await liveDashboard();
    expect(response.body.registrations.todayTotal).toBe(1);
  });

  // F02-027
  it('does not count shifts that have not happened yet as no-shows', async () => {
    const tomorrow = await createEventDayOn('2027-01-08', 'Day 2');
    const today = await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
    });
    await rawDb.shiftAssignment.update({
      where: { id: today.id },
      data: { checkedInAt: new Date('2027-01-07T01:30:00.000Z') },
    });
    await assignToStation({ volunteerId: volunteer.id, stationId, eventDayId: tomorrow.id });

    const response = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(chief));
    expect(response.status).toBe(200);
    expect(response.body.volunteers.noShows).toBe(0);
  });

  // F03-012
  it('imports two paper tallies for the same station, category and time as separate rows', async () => {
    const response = await request(app)
      .post('/api/v1/fallback/imports/registrations')
      .set('Authorization', bearer(chief))
      .send({
        source: 'PAPER',
        commit: true,
        fileName: 'desk-sheets.csv',
        rows: [
          // Two volunteers' sheets for the same half hour at the same desk.
          {
            category: 'SEC_3',
            stationCode: 'DESK',
            timeBlockStart: '2027-01-07T02:00:00.000Z',
            count: 2,
          },
          {
            category: 'SEC_3',
            stationCode: 'DESK',
            timeBlockStart: '2027-01-07T02:00:00.000Z',
            count: 3,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(await rawDb.registration.count()).toBe(5);
  });

  // F03-012
  it('imports two footfall tallies for the same station and time as separate rows', async () => {
    const rows = [
      { stationCode: 'DESK', timeBlockStart: '2027-01-07T02:00:00.000Z', quantity: 4 },
      { stationCode: 'DESK', timeBlockStart: '2027-01-07T02:00:00.000Z', quantity: 6 },
    ];
    const post = (): request.Test =>
      request(app)
        .post('/api/v1/fallback/imports/footfall')
        .set('Authorization', bearer(chief))
        .send({ source: 'PAPER', commit: true, fileName: 'door-sheets.csv', rows });

    expect((await post()).status).toBe(201);
    // Re-running the same file is still safe.
    expect((await post()).body.recordsCreated).toBe(0);

    const total = await rawDb.footfallTick.aggregate({ _sum: { quantity: true } });
    expect(total._sum.quantity).toBe(10);
  });

  // F02-011
  it('lists a person rostered in both blocks so the two rows can be told apart', async () => {
    const ic = await createVolunteer({ email: 'ic@numbers.test', role: 'IC' });
    await assignToStation({ volunteerId: ic.id, stationId, eventDayId: dayId });
    await assignToStation({ volunteerId: volunteer.id, stationId, eventDayId: dayId });
    await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
      shift: 'AFTERNOON',
    });

    const response = await request(app)
      .get(`/api/v1/dashboard/station/${stationId}`)
      .set('Authorization', bearer(ic));
    expect(response.status).toBe(200);

    const dashboard = StationDashboardResponse.parse(response.body);
    expect(dashboard.rosterAvailability).toBe('available');
    expect(dashboard.roster).toHaveLength(3);
    const assignments = dashboard.roster.filter((row) => row.volunteerId === volunteer.id);
    const rows = assignments.map((row) => JSON.stringify(row));
    expect(rows).toHaveLength(2);
    expect(new Set(rows).size).toBe(2);
    expect(new Set(assignments.map((row) => row.assignmentId)).size).toBe(2);
    expect(new Set(assignments.map((row) => row.shift.id)).size).toBe(2);
    expect(assignments.map((row) => row.shift.code).sort()).toEqual(['AFTERNOON', 'MORNING']);
  });

  // F03-014
  it('pushes an urgent announcement to the same people it says it reaches', async () => {
    const booth = (await createStation({ code: 'BOOTH' })).id;
    const ic = await createVolunteer({ email: 'ic@numbers.test', role: 'IC' });
    const deputy = await createVolunteer({ email: 'deputy@numbers.test', role: 'DEPUTY_COORDINATOR' });
    await assignToStation({ volunteerId: ic.id, stationId: booth, eventDayId: dayId });
    await assignToStation({ volunteerId: volunteer.id, stationId: booth, eventDayId: dayId });

    for (const person of [ic, volunteer, deputy, chief]) {
      await rawDb.pushSubscription.create({ data: { volunteerId: person.id,
        endpoint: `https://push.example.test/${person.id}`, p256dh: 'synthetic-key', auth: 'synthetic-auth',
        lastSeenAt: FROZEN_NOW } });
    }

    const response = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', bearer(chief))
      .send({
        body: 'ICs at the booth: swap the banner now',
        priority: 'URGENT',
        target: { role: 'IC', stationId: booth },
      });
    expect(response.status).toBe(201);
    const audience = response.body.announcement.audienceCount as number;
    expect(audience).toBe(1);

    const announcementId = response.body.announcement.id as string;
    const plan = await rawDb.announcementDeliveryPlan.findFirstOrThrow({ where: { announcementId } });
    expect(plan).toMatchObject({ recipientCount: audience, deviceCount: 1 });
    expect((await rawDb.notice.findMany({ where: { sourceId: announcementId } }))
      .map((row) => row.recipientPersonId)).toEqual([ic.id]);
    const deliveries = await rawDb.announcementPushDelivery.findMany({ where: { planId: plan.id } });
    expect(deliveries.map((row) => row.recipientPersonId)).toEqual([ic.id]);
    expect(deliveries[0]?.status).toBe('PENDING');
    expect(await rawDb.noticeDelivery.count()).toBe(0);

    const clock = fixedClock(FROZEN_NOW);
    const claims = await claimDueDeliveries({ workerId: 'numbers-repro', clock });
    expect(claims).toHaveLength(1);
    const send = vi.fn<(input: DevicePushInput) => Promise<DevicePushResult>>().mockResolvedValue('ACCEPTED');
    expect(await executeClaimedDelivery({ claim: claims[0]!, clock, send })).toBe('SENT');
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      target: expect.objectContaining({ endpoint: `https://push.example.test/${ic.id}` }),
      payload: expect.objectContaining({ kind: 'announcement.urgent', priority: 'URGENT' }),
    }));
    expect((await rawDb.announcementPushDelivery.findUniqueOrThrow({ where: { id: deliveries[0]!.id } })).status).toBe('SENT');
  });
});
