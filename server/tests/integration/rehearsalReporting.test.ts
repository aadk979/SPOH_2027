import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { FullReport } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { toXlsx } from '../../src/modules/report/application/export/toXlsx.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
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
let admin: TestVolunteer;
const get = (query: string) =>
  request(app)
    .get(`/api/v1/events/${eventId}/reports/${query}`)
    .set('Authorization', bearer(admin));

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  await createEventDayToday();
  admin = await createVolunteer({ email: 'admin@practice-report.test', role: 'ADMIN' });
  const stationId = (await createStation({ code: 'REPORT', countsEntry: true, issuesStamp: true }))
    .id;
  const category = await rawDb.captureCategory.findFirstOrThrow({
    where: { eventId, code: 'SEC_4' },
  });
  const gift = await rawDb.giftType.create({
    data: { eventId, name: 'Badge', initialStock: 10, rehearsalInitialStock: 3 },
  });
  await rawDb.visitorField.create({
    data: {
      eventId,
      code: 'contact',
      label: 'Contact',
      type: 'email',
      classification: 'visitor-personal',
      retentionDays: 1,
      readers: ['ADMIN'],
    },
  });
  for (const rehearsal of [false, true]) {
    const mode = rehearsal ? 'practice' : 'live';
    const scope = { eventId, rehearsal };
    const recorder = { recordedById: admin.id, recordedAt: FROZEN_NOW };
    const registration = await rawDb.registration.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        categoryId: category.id,
        source: 'APP',
        idempotencyKey: `registration-${mode}`,
      },
    });
    await rawDb.registration.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        categoryId: category.id,
        source: 'APP',
        idempotencyKey: `void-${mode}`,
        voided: true,
      },
    });
    await rawDb.visitorRecord.create({
      data: { eventId, registrationId: registration.id, data: { contact: `${mode}@visitor.test` } },
    });
    await rawDb.footfallTick.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        source: 'APP',
        quantity: rehearsal ? 7 : 2,
        idempotencyKey: `footfall-${mode}`,
      },
    });
    const card = await rawDb.missionCard.create({
      data: {
        ...scope,
        shortCode: rehearsal ? 'ABC234' : 'DEF234',
        qrPayload: mode,
        status: 'COMPLETED',
        issuedAt: FROZEN_NOW,
        completedAt: FROZEN_NOW,
      },
    });
    await rawDb.cardStampEvent.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        missionCardId: card.id,
        source: 'APP',
        idempotencyKey: `stamp-${mode}`,
      },
    });
    await rawDb.giftRedemption.create({
      data: {
        ...scope,
        ...recorder,
        stationId,
        giftTypeId: gift.id,
        missionCardId: card.id,
        source: 'APP',
        idempotencyKey: `gift-${mode}`,
      },
    });
    await rawDb.incident.create({
      data: {
        ...scope,
        stationId,
        reportedById: admin.id,
        type: 'OTHER',
        severity: 'LOW',
        description: `${mode} incident`,
        idempotencyKey: `incident-${mode}`,
        occurredAt: FROZEN_NOW,
        reportedAt: FROZEN_NOW,
      },
    });
    await rawDb.lostFoundItem.create({
      data: { ...scope, itemLabel: `${mode} bottle`, foundAt: FROZEN_NOW, loggedById: admin.id },
    });
    await rawDb.lostPersonAlert.create({
      data: {
        ...scope,
        raisedById: admin.id,
        raisedAt: FROZEN_NOW,
        descriptionText: `${mode} sensitive alert`,
      },
    });
    await rawDb.lostPersonSummary.create({
      data: {
        ...scope,
        raisedAt: FROZEN_NOW,
        resolvedAt: FROZEN_NOW,
        resolutionMinutes: 0,
        outcome: 'RESOLVED_FOUND',
        ackCount: 1,
      },
    });
    await rawDb.fallbackWindow.create({
      data: {
        ...scope,
        declaredById: admin.id,
        tier: 4,
        reason: `${mode} window`,
        startedAt: new Date(FROZEN_NOW.getTime() - 60_000),
        endedAt: FROZEN_NOW,
      },
    });
    await rawDb.importBatch.create({
      data: {
        ...scope,
        importedById: admin.id,
        source: 'PAPER',
        targetTable: 'Registration',
        rowCount: 1,
        fileName: `${mode}.csv`,
      },
    });
  }
});

describe('reports read capture provenance', () => {
  it.each(['LIVE', 'REHEARSAL'] as const)(
    'excludes practice rows by default while the event is %s',
    async (status) => {
      await rawDb.event.update({ where: { id: eventId }, data: { status } });
      const response = await get('summary');
      expect(response.status).toBe(200);
      const report = FullReport.parse(response.body);
      expect(report.rehearsalIncluded).toBe(false);
      expect(report.registrations).toMatchObject({ total: 1, voided: 1 });
      expect(report.registrations.byDay[0]?.value).toBe(1);
      expect(report.registrations.byHour[0]?.value).toBe(1);
      expect(report.footfall.total).toBe(2);
      expect(report.footfall.curve[0]?.value).toBe(2);
      expect(report.cards).toMatchObject({ issued: 1, completed: 1 });
      expect(report.cards.byStation[0]?.cards).toBe(1);
      expect(report.gifts).toMatchObject({
        total: 1,
        byGiftType: [{ redeemed: 1, remaining: 9, rehearsal: false }],
      });
      expect(report.safety.incidents.map((row) => row.description)).toEqual(['live incident']);
      expect(report.safety.lostPerson.cases).toBe(2);
      expect(report.safety.lostAndFound.logged).toBe(1);
      expect(report.dataIntegrity.fallbackWindows).toHaveLength(1);
      expect(report.dataIntegrity.imports.map((row) => row.fileName)).toEqual(['live.csv']);
      expect(
        report.dataIntegrity.recordsBySource.find((row) => row.table === 'FootfallTick')?.value,
      ).toBe(2);
      expect(
        report.dataIntegrity.voidedRecords.find((row) => row.table === 'Registration')?.value,
      ).toBe(1);
      expect(JSON.stringify(report)).not.toContain('sensitive alert');
    },
  );

  it('includes practice explicitly and keeps the two stock pools distinct', async () => {
    const response = await get('summary?includeRehearsal=true');
    expect(response.status).toBe(200);
    const report = FullReport.parse(response.body);
    expect(report.rehearsalIncluded).toBe(true);
    expect(report.registrations).toMatchObject({ total: 2, voided: 2 });
    expect(report.footfall.total).toBe(9);
    expect(report.cards).toMatchObject({ issued: 2, completed: 2 });
    expect(report.cards.byStation[0]?.cards).toBe(2);
    expect(report.gifts.total).toBe(2);
    expect(report.gifts.byGiftType).toEqual([
      expect.objectContaining({ rehearsal: false, redeemed: 1, remaining: 9 }),
      expect.objectContaining({ rehearsal: true, redeemed: 1, remaining: 2 }),
    ]);
    expect(report.safety.incidents).toHaveLength(2);
    expect(report.safety.lostPerson.cases).toBe(4);
    expect(report.safety.lostAndFound.logged).toBe(2);
    expect(report.dataIntegrity.fallbackWindows).toHaveLength(2);
    expect(report.dataIntegrity.imports).toHaveLength(2);
    expect((await get('summary?includeRehearsal=false')).body.registrations.total).toBe(1);
    expect((await get('summary?includeRehearsal=unexpected')).status).toBe(400);
    const document = new ExcelJS.Workbook();
    await document.xlsx.load(Uint8Array.from(await toXlsx(report)).buffer);
    expect(JSON.stringify(document.getWorksheet('Read me first')?.getSheetValues())).toContain(
      'Includes rehearsal data',
    );
    expect(JSON.stringify(document.getWorksheet('Gifts')?.getSheetValues())).toContain('REHEARSAL');
  });

  it('filters visitor exports and labels CSV inclusion independently of current phase', async () => {
    const live = await get('export?format=csv');
    expect(live.status).toBe(200);
    expect(live.text).toContain('Rehearsal data is excluded');
    expect(live.text).toContain('live@visitor.test');
    expect(live.text).not.toContain('practice@visitor.test');
    const all = await get('export?format=csv&includeRehearsal=true');
    expect(all.status).toBe(200);
    expect(all.text).toContain('Includes rehearsal data');
    expect(all.text).toContain('practice@visitor.test');
    expect(all.text).toContain('Badge,1,9,LIVE');
    expect(all.text).toContain('Badge,1,2,REHEARSAL');
    expect(all.text).not.toContain('sensitive alert');
  });
});
