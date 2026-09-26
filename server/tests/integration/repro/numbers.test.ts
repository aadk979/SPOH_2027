import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app.js';
import { logger } from '../../../src/lib/logger.js';
import { prisma } from '../../../src/lib/prisma.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
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
  await prisma.registration.create({
    data: {
      category: 'SEC_3',
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
  it.skip('does not count shifts that have not happened yet as no-shows', async () => {
    const tomorrow = await prisma.eventDay.create({
      data: { date: new Date('2027-01-08T00:00:00.000Z'), label: 'Day 2' },
    });
    const today = await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
    });
    await prisma.shiftAssignment.update({
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
  it.skip('imports two paper tallies for the same station, category and time as separate rows', async () => {
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
    expect(await prisma.registration.count()).toBe(5);
  });

  // F02-011
  it.skip('lists a person rostered in both blocks so the two rows can be told apart', async () => {
    const ic = await createVolunteer({ email: 'ic@numbers.test', role: 'IC' });
    await assignToStation({ volunteerId: volunteer.id, stationId, eventDayId: dayId });
    await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
      block: 'AFTERNOON',
    });

    const response = await request(app)
      .get(`/api/v1/dashboard/station/${stationId}`)
      .set('Authorization', bearer(ic));
    expect(response.status).toBe(200);

    // The IC console keys "Who is here" by volunteerId: two identical rows are
    // a duplicate React key and a person listed twice with nothing to say why.
    const rows = (response.body.roster as unknown[]).map((row) => JSON.stringify(row));
    expect(rows).toHaveLength(2);
    expect(new Set(rows).size).toBe(2);
  });

  // F03-014
  it.skip('pushes an urgent announcement to the same people it says it reaches', async () => {
    const booth = (await createStation({ code: 'BOOTH' })).id;
    const ic = await createVolunteer({ email: 'ic@numbers.test', role: 'IC' });
    await createVolunteer({ email: 'deputy@numbers.test', role: 'DEPUTY_COORDINATOR' });
    await assignToStation({ volunteerId: ic.id, stationId: booth, eventDayId: dayId });
    await assignToStation({ volunteerId: volunteer.id, stationId: booth, eventDayId: dayId });

    const warn = vi.spyOn(logger, 'warn');

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

    // Push is not configured in tests, so dispatch logs the recipient count.
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'announcement.urgent' }),
        expect.any(String),
      );
    });
    const call = warn.mock.calls.find(
      ([fields]) => (fields as { kind?: string }).kind === 'announcement.urgent',
    );
    expect((call?.[0] as { recipients: number }).recipients).toBe(audience);
  });
});
