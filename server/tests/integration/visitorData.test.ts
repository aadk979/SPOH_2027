import type { Express } from 'express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { purgeVisitorData } from '../../src/modules/visitor/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

let app: Express;
let booth: TestVolunteer;
let chief: TestVolunteer;
let ic: TestVolunteer;
let lead: TestVolunteer;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  const day = await createEventDayToday();
  const { eventId } = await testEvent();
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'READY' } });
  stationId = (await createStation({ code: 'BOOTH' })).id;
  booth = await createVolunteer({ email: 'booth@visitor.test', role: 'VOLUNTEER' });
  chief = await createVolunteer({ email: 'chief@visitor.test', role: 'CHIEF_COORDINATOR' });
  ic = await createVolunteer({ email: 'ic@visitor.test', role: 'IC' });
  lead = await createVolunteer({ email: 'lead@visitor.test', role: 'LEAD' });
  await assignToStationAllBlocks({ volunteerId: booth.id, stationId, eventDayId: day.id });
});

const changeMode = (mode: 'none' | 'allowlist', version: number) =>
  request(app)
    .patch('/api/v1/admin/event-settings')
    .set('Authorization', bearer(chief))
    .send({ key: 'product.visitorDataMode', value: mode, expectedVersion: version });

const field = (code: string, retentionDays: number, readers: string[]) =>
  request(app).post('/api/v1/admin/visitor-fields').set('Authorization', bearer(chief)).send({
    code,
    label: code,
    type: 'text',
    classification: 'visitor-personal',
    retentionDays,
    readers,
  });

const tap = (visitor?: Record<string, string>) =>
  request(app)
    .post('/api/v1/registrations')
    .set('Authorization', bearer(booth))
    .send({
      category: 'SEC_4',
      stationId,
      idempotencyKey: idempotencyKey(),
      ...(visitor ? { visitor } : {}),
    });

describe('per-event visitor allowlist (ADR-002 §4)', () => {
  it('defaults to no personal data and rejects undeclared values without a count', async () => {
    const refused = await tap({ contact: 'visitor@example.test' });
    expect(refused.status).toBe(422);
    expect(await rawDb.registration.count()).toBe(0);
    expect(await rawDb.visitorRecord.count()).toBe(0);
    expect((await tap()).status).toBe(201);
    const report = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(chief));
    expect(report.body).not.toHaveProperty('visitorRecords');
    const exported = await request(app)
      .get('/api/v1/reports/export?format=csv')
      .set('Authorization', bearer(chief));
    expect(exported.text).not.toContain('Visitor details');
  });

  it('keeps declared values apart from counts, filters each reader and purges on switch off', async () => {
    expect((await changeMode('allowlist', 0)).status).toBe(200);
    expect((await field('contact', 2, ['CHIEF_COORDINATOR'])).status).toBe(201);
    expect((await field('interest', 5, ['IC', 'LEAD', 'CHIEF_COORDINATOR'])).status).toBe(201);

    const rejected = await tap({ unknown: 'secret' });
    expect(rejected.status).toBe(422);
    expect(await rawDb.registration.count()).toBe(0);

    const captured = await tap({ contact: 'visitor@example.test', interest: 'computing' });
    expect(captured.status).toBe(201);
    expect(JSON.stringify(captured.body)).not.toContain('visitor@example.test');
    expect(await rawDb.registration.count()).toBe(1);
    expect(await rawDb.visitorRecord.count()).toBe(1);

    const icRead = await request(app).get('/api/v1/visitors').set('Authorization', bearer(ic));
    expect(icRead.status).toBe(200);
    expect(icRead.headers['cache-control']).toBe('no-store');
    expect(icRead.body.fields.map((item: { code: string }) => item.code)).toEqual(['interest']);
    expect(icRead.body.data[0].values).toEqual({ interest: 'computing' });

    const volunteerRead = await request(app)
      .get('/api/v1/visitors')
      .set('Authorization', bearer(booth));
    expect(volunteerRead.status).toBe(403);

    const exportFile = await request(app)
      .get('/api/v1/reports/export?format=csv')
      .set('Authorization', bearer(chief));
    expect(exportFile.status).toBe(200);
    expect(exportFile.text).toContain('visitor@example.test');
    expect(exportFile.text).toContain('Visitor details');
    const leadExport = await request(app)
      .get('/api/v1/reports/export?format=csv')
      .set('Authorization', bearer(lead));
    expect(leadExport.text).toContain('computing');
    expect(leadExport.text).not.toContain('visitor@example.test');
    const report = await request(app)
      .get('/api/v1/reports/summary')
      .set('Authorization', bearer(chief));
    expect(JSON.stringify(report.body)).not.toContain('visitor@example.test');

    const xlsx = await request(app)
      .get('/api/v1/reports/export?format=xlsx')
      .set('Authorization', bearer(chief))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body as Parameters<typeof workbook.xlsx.load>[0]);
    const visitorSheet = workbook.getWorksheet('Visitor details');
    expect(visitorSheet?.getCell('B3').value).toBe('visitor@example.test');

    expect((await changeMode('none', 1)).status).toBe(200);
    expect(await rawDb.visitorRecord.count()).toBe(0);
    expect(await rawDb.registration.count()).toBe(1);
  });

  it('stamps purgeAfter at close and removes each field on its own deadline', async () => {
    expect((await changeMode('allowlist', 0)).status).toBe(200);
    await field('early', 1, ['CHIEF_COORDINATOR']);
    await field('late', 3, ['CHIEF_COORDINATOR']);
    expect((await tap({ early: 'one', late: 'three' })).status).toBe(201);

    const { eventId } = await testEvent();
    const closedAt = new Date('2026-09-20T00:00:00.000Z');
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED', closedAt } });
    expect(await purgeVisitorData(new Date('2026-09-22T00:00:00.000Z'))).toBeGreaterThan(0);
    const kept = await rawDb.visitorRecord.findFirstOrThrow({ where: { eventId } });
    expect(kept.data).toEqual({ late: 'three' });
    expect(kept.purgeAfter?.toISOString()).toBe('2026-09-23T00:00:00.000Z');
    await purgeVisitorData(new Date('2026-09-24T00:00:00.000Z'));
    expect(await rawDb.visitorRecord.count()).toBe(0);
    expect(await rawDb.registration.count()).toBe(1);
  });
});
