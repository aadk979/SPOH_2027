import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FullReport } from '@spoh/shared';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { toCsv } from '../../src/modules/report/export.js';
import { purgeResolvedAlerts } from '../../src/modules/lostPerson/service.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * The post-event report (PRODUCT_BRIEF §10).
 *
 * The tests worth having are the ones about honesty: the three counts stay
 * separate, fallback periods are declared in the document itself, and no report
 * can reach a lost-person description.
 */

let app: Express;
let booth: TestVolunteer;
let counter: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let lead: TestVolunteer;
let boothStationId: string;
let roomAId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  boothStationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;
  roomAId = (await createStation({ code: 'ROOM_A', name: 'Room A', countsEntry: true })).id;

  booth = await createVolunteer({ email: 'booth@rep.test', role: 'VOLUNTEER' });
  counter = await createVolunteer({ email: 'counter@rep.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@rep.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@rep.test', role: 'CHIEF_COORDINATOR' });
  lead = await createVolunteer({ email: 'lead@rep.test', role: 'LEAD' });

  await assignToStationAllBlocks({
    volunteerId: booth.id,
    stationId: boothStationId,
    eventDayId: eventDay.id,
  });
  await assignToStationAllBlocks({
    volunteerId: counter.id,
    stationId: roomAId,
    eventDayId: eventDay.id,
  });

  // Exists so the report has a gift section to fill in; the report reads every
  // gift type, so the id is never needed here.
  await prisma.giftType.create({
    data: { name: 'Tote Bag', initialStock: 100, lowStockThreshold: 10 },
  });
});

async function capture(): Promise<void> {
  for (const category of ['SEC_4', 'SEC_4', 'PARENT_GUARDIAN'] as const) {
    await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({ category, stationId: boothStationId, idempotencyKey: idempotencyKey() });
  }

  for (let i = 0; i < 5; i += 1) {
    await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(counter))
      .send({ stationId: roomAId, idempotencyKey: idempotencyKey() });
  }
}

async function report(actor: TestVolunteer = chief): Promise<FullReport> {
  const response = await request(app)
    .get('/api/v1/reports/summary')
    .set('Authorization', bearer(actor));

  expect(response.status).toBe(200);
  return response.body as FullReport;
}

describe('access', () => {
  it('denies a volunteer', async () => {
    const response = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(booth));

    expect(response.status).toBe(403);
  });

  it('denies an IC', async () => {
    const response = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(ic));

    expect(response.status).toBe(403);
  });

  it('allows the Lead, who has to write the write-up', async () => {
    const response = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(lead));

    expect(response.status).toBe(200);
  });
});

describe('the three counts stay separate', () => {
  it('labels each count with its own unit', async () => {
    await capture();
    const result = await report();

    expect(result.registrations.unit).toBe('registrations');
    expect(result.registrations.total).toBe(3);

    expect(result.footfall.unit).toBe('roomEntries');
    expect(result.footfall.total).toBe(5);

    expect(result.cards.unit).toBe('cards');
    expect(result.gifts.unit).toBe('redemptions');
  });

  it('opens with a note saying the counts must not be added', async () => {
    const result = await report();

    // The single most likely misreading of this document is that these are the
    // same people counted three ways. Saying so once, in prose, at the top.
    expect(result.countingNote).toContain('must not be added together');
    expect(result.countingNote).toContain('no honest way');
  });

  it('has no combined visitor figure anywhere', async () => {
    await capture();
    const result = await report();

    expect(JSON.stringify(result)).not.toMatch(/totalVisitors/i);
  });
});

describe('corrections are visible, not hidden', () => {
  it('excludes voided rows from the total and reports the count separately', async () => {
    await capture();

    const created = await request(app)
      .post('/api/v1/registrations')
      .set('Authorization', bearer(booth))
      .send({ category: 'OTHER', stationId: boothStationId, idempotencyKey: idempotencyKey() });

    await request(app)
      .post(`/api/v1/registrations/${created.body.registration.id}/void`)
      .set('Authorization', bearer(ic))
      .send({ reason: 'Double tap while the queue was moving' });

    const result = await report();

    expect(result.registrations.total).toBe(3);
    expect(result.registrations.voided).toBe(1);
    expect(
      result.dataIntegrity.voidedRecords.find((row) => row.table === 'Registration')?.value,
    ).toBe(1);
  });
});

describe('data integrity', () => {
  it('reports a clean run as containing no fallback data', async () => {
    await capture();
    const result = await report();

    expect(result.dataIntegrity.containsFallbackData).toBe(false);
    expect(result.dataIntegrity.degradedMinutes).toBe(0);
  });

  it('lists every fallback window with its duration', async () => {
    const declared = await request(app)
      .post('/api/v1/fallback/windows')
      .set('Authorization', bearer(chief))
      .send({
        tier: 3,
        reason: 'Backend unreachable from the booth',
        startedAt: new Date(FROZEN_NOW.getTime() - 90 * 60_000).toISOString(),
      });

    await request(app)
      .post(`/api/v1/fallback/windows/${declared.body.window.id}/close`)
      .set('Authorization', bearer(chief))
      .send({ endedAt: new Date(FROZEN_NOW.getTime() - 30 * 60_000).toISOString() });

    const result = await report();

    expect(result.dataIntegrity.containsFallbackData).toBe(true);
    expect(result.dataIntegrity.fallbackWindows).toHaveLength(1);
    expect(result.dataIntegrity.degradedMinutes).toBe(60);
    expect(result.dataIntegrity.fallbackWindows[0]?.reason).toContain('unreachable');
  });

  it('splits records by source so app taps and paper are distinguishable', async () => {
    await capture();

    await request(app)
      .post('/api/v1/fallback/imports/footfall')
      .set('Authorization', bearer(chief))
      .send({
        source: 'PAPER',
        commit: true,
        rows: [{ stationCode: 'ROOM_A', quantity: 40, timeBlockStart: FROZEN_NOW.toISOString() }],
      });

    const result = await report();

    const footfallSources = result.footfall.bySource;
    expect(footfallSources.find((row) => row.source === 'APP')?.value).toBe(5);
    expect(footfallSources.find((row) => row.source === 'PAPER')?.value).toBe(40);

    // The total is the sum, and the split is right beside it — never one
    // without the other.
    expect(result.footfall.total).toBe(45);
  });

  it('cites the imports that were run', async () => {
    await request(app)
      .post('/api/v1/fallback/imports/footfall')
      .set('Authorization', bearer(chief))
      .send({
        source: 'PAPER',
        commit: true,
        fileName: 'paper-tally.csv',
        notes: 'Transcribed by the Room A IC',
        rows: [{ stationCode: 'ROOM_A', quantity: 12, timeBlockStart: FROZEN_NOW.toISOString() }],
      });

    const result = await report();

    expect(result.dataIntegrity.imports).toHaveLength(1);
    expect(result.dataIntegrity.imports[0]?.fileName).toBe('paper-tally.csv');
    expect(result.dataIntegrity.imports[0]?.notes).toContain('Room A IC');
  });
});

describe('safety reporting never reads a lost-person description', () => {
  it('reports counts and timings only', async () => {
    const raised = await request(app)
      .post('/api/v1/lost-person')
      .set('Authorization', bearer(booth))
      .send({
        descriptionText: 'Child in a red jacket separated near the lounge',
        clothingText: 'red jacket',
        idempotencyKey: idempotencyKey(),
      });

    await request(app)
      .post(`/api/v1/lost-person/${raised.body.alert.id}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    // Backdate past the retention window and purge, as the scheduled job would.
    await prisma.lostPersonAlert.update({
      where: { id: raised.body.alert.id },
      data: {
        raisedAt: new Date(FROZEN_NOW.getTime() - 26 * 60 * 60 * 1000),
        resolvedAt: new Date(FROZEN_NOW.getTime() - 25 * 60 * 60 * 1000),
      },
    });
    await purgeResolvedAlerts(FROZEN_NOW);

    const result = await report();

    expect(result.safety.lostPerson.cases).toBe(1);
    expect(result.safety.lostPerson.resolved).toBe(1);
    expect(result.safety.lostPerson.medianResolutionMinutes).toBe(60);

    // What goes in the report is "1 case, resolved, 60 minutes" — never a
    // description of a child.
    expect(JSON.stringify(result.safety)).not.toContain('red jacket');
    expect(JSON.stringify(result)).not.toContain('red jacket');
  });

  it('counts an unpurged case rather than reporting zero', async () => {
    const raised = await request(app)
      .post('/api/v1/lost-person')
      .set('Authorization', bearer(booth))
      .send({
        descriptionText: 'Child separated near the lounge',
        idempotencyKey: idempotencyKey(),
      });

    await request(app)
      .post(`/api/v1/lost-person/${raised.body.alert.id}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    const result = await report();

    // A report run the morning after would otherwise say "0 cases" purely
    // because the 24-hour purge had not run yet — wrong in the most alarming
    // possible way.
    expect(result.safety.lostPerson.cases).toBe(1);
    expect(result.safety.lostPerson.resolved).toBe(1);
  });
});

describe('volunteer hours', () => {
  it('counts a shift nobody checked out of as zero hours, not as open-ended', async () => {
    await prisma.shiftAssignment.updateMany({
      where: { volunteerId: booth.id },
      data: { checkedInAt: new Date(FROZEN_NOW.getTime() - 5 * 60 * 60 * 1000) },
    });

    const result = await report();

    expect(result.volunteers.checkedIn).toBeGreaterThan(0);
    // The honest answer is that we do not know when they left.
    expect(result.volunteers.totalHours).toBe(0);
  });

  it('reports no-shows as a rate once the shifts have ended', async () => {
    // 23:00 Singapore: both blocks of the day are over.
    vi.setSystemTime(new Date('2027-01-07T15:00:00.000Z'));
    try {
      const result = await report();

      expect(result.volunteers.assignments).toBe(4);
      expect(result.volunteers.checkedIn).toBe(0);
      expect(result.volunteers.noShows).toBe(4);
      expect(result.volunteers.noShowRate).toBe(1);
    } finally {
      vi.setSystemTime(FROZEN_NOW);
    }
  });

  // F02-027
  it('reports shifts that have not ended as not yet due, not as no-shows', async () => {
    const result = await report();

    expect(result.volunteers.noShows).toBe(0);
    expect(result.volunteers.notYetDue).toBe(4);
    expect(result.volunteers.noShowRate).toBe(0);
  });
});

describe('export', () => {
  it('produces an XLSX the Lead can open', async () => {
    await capture();

    const response = await request(app)
      .get('/api/v1/reports/export?format=xlsx')
      .set('Authorization', bearer(lead))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('.xlsx');

    // XLSX files are ZIP archives — "PK" is the magic number.
    const body = response.body as Buffer;
    expect(body.subarray(0, 2).toString()).toBe('PK');
    expect(body.length).toBeGreaterThan(5000);
  });

  it('produces a CSV that states the units and the counting rule', async () => {
    await capture();

    const response = await request(app)
      .get('/api/v1/reports/export?format=csv')
      .set('Authorization', bearer(lead));

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');

    const csv = response.text;
    expect(csv).toContain('unit: registrations');
    expect(csv).toContain('unit: roomEntries');
    expect(csv).toContain('journeys, not people');
  });

  it('quotes a description containing commas and newlines', async () => {
    const csv = toCsv({
      ...(await report()),
      safety: {
        ...(await report()).safety,
        incidents: [
          {
            id: 'x',
            type: 'NEAR_MISS',
            severity: 'LOW',
            status: 'OPEN',
            stationName: 'Room A',
            occurredAt: FROZEN_NOW.toISOString(),
            reportedAt: FROZEN_NOW.toISOString(),
            description: 'A cable, taped down,\nafter someone tripped',
            followUpCount: 0,
          },
        ],
      },
    });

    // Incident descriptions are free text and will contain both.
    expect(csv).toContain('"A cable, taped down,\nafter someone tripped"');
  });
});
