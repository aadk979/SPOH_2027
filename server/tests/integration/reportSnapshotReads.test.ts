import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { FullReport, ReportSnapshotsResponse, reportReadLabel } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { scheduledReportFixture, type ScheduledReportFixture } from '../helpers/scheduledReport.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';

const app = createApp();
let f: ScheduledReportFixture;
let id: string;
let fixtureNumber = 0;
const base = () => `/api/v1/events/${f.eventId}/reports/snapshots`;
const get = (suffix = '', actor: TestVolunteer = f.creator) =>
  request(app).get(`${base()}${suffix}`).set('Authorization', bearer(actor));
const saved = () => rawDb.reportSnapshot.findFirstOrThrow({ where: { eventId: f.eventId, id } });

beforeEach(async () => {
  await resetDatabase();
  f = await scheduledReportFixture({
    creatorEmail: `snapshot-read-${fixtureNumber++}@test.example`,
  });
  await f.registration();
  await f.create();
  expect(await f.run()).toBe('SUCCEEDED');
  id = (await f.snapshots())[0]!.id;
});

it('returns the stored daily document after later corrections, without writing any receipts', async () => {
  const before = await saved();
  const auditCount = await rawDb.auditLog.count();
  await f.registration();
  const response = await get(`/${id}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const report = FullReport.parse(response.body);
  expect(report).toMatchObject({
    ...FullReport.parse(before.report),
    snapshot: {
      id,
      kind: 'DAILY',
      lifecycleVersion: before.lifecycleVersion,
      createdAt: before.createdAt.toISOString(),
      supersededAt: null,
    },
  });
  expect(report.registrations.total).toBe(1);
  expect(reportReadLabel(report)).toContain('Frozen daily report');
  expect(reportReadLabel(report)).toContain('Later corrections are excluded.');
  expect(await saved()).toEqual(before);
  expect(await rawDb.auditLog.count()).toBe(auditCount);
});

it('lists only bounded metadata, including completed-day ranges and explicit practice provenance', async () => {
  await f.registration(true);
  await f.create({ includeRehearsal: true });
  expect(await f.run()).toBe('SUCCEEDED');
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const list = ReportSnapshotsResponse.parse(response.body);
  expect(list.meta).toEqual({ count: 2, nextCursor: null });
  expect(list.data.map((row) => row.rehearsalIncluded).sort()).toEqual([false, true]);
  expect(list.data.every((row) => row.kind === 'DAILY' && row.supersededAt === null)).toBe(true);
  expect(list.data.map((row) => row.range)).toEqual([
    { from: f.start.toISOString(), to: f.end.toISOString() },
    { from: f.start.toISOString(), to: f.end.toISOString() },
  ]);
  expect(JSON.stringify(list)).not.toMatch(/dedupeKey|createdByPersonId|registrations|volunteers/);
});

it('paginates tied timestamps without duplication and keeps newer inserts out of a continued page', async () => {
  const source = await saved();
  const insert = (suffix: string, createdAt = source.createdAt) =>
    rawDb.reportSnapshot.create({
      data: {
        id: `read-page-${suffix}`,
        eventId: f.eventId,
        kind: 'DAILY',
        lifecycleVersion: source.lifecycleVersion,
        dedupeKey: `daily:read-page:${suffix}`,
        report: FullReport.parse(source.report),
        createdAt,
      },
    });
  await insert('a');
  await insert('b');
  await insert('c');
  const first = ReportSnapshotsResponse.parse((await get('?limit=2')).body);
  expect(first.data.map((row) => row.id)).toEqual(['read-page-c', 'read-page-b']);
  expect(first.meta.nextCursor).toBe('read-page-b');
  await insert('new', new Date(source.createdAt.getTime() + 1));
  const second = ReportSnapshotsResponse.parse(
    (await get(`?limit=2&cursor=${first.meta.nextCursor}`)).body,
  );
  expect(second.data.map((row) => row.id)).toEqual(['read-page-a', id]);
  expect(second.meta.nextCursor).toBeNull();
  expect(new Set([...first.data, ...second.data].map((row) => row.id)).size).toBe(4);
  expect(ReportSnapshotsResponse.parse((await get('?limit=1')).body).data[0]!.id).toBe(
    'read-page-new',
  );
});

it('marks superseded final reads and exports while preserving the new active frozen default', async () => {
  const admin = await createVolunteer({ email: 'snapshot-admin@test.example', role: 'ADMIN' });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: f.eventId } });
  await rawDb.organisationMembership.create({
    data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
  const transition = (to: string, version: number) =>
    request(app)
      .post(`/api/v1/events/${f.eventId}/lifecycle`)
      .set('Authorization', bearer(admin))
      .send({
        to,
        expectedVersion: version,
        reason: 'Correct drill close',
        idempotencyKey: idempotencyKey(),
      });
  expect((await transition('CLOSED', event.lifecycleVersion)).status).toBe(200);
  const old = await rawDb.reportSnapshot.findFirstOrThrow({
    where: { eventId: f.eventId, kind: 'FINAL' },
  });
  expect((await transition('LIVE', event.lifecycleVersion + 1)).status).toBe(200);
  await f.registration();
  expect((await transition('CLOSED', event.lifecycleVersion + 2)).status).toBe(200);
  const list = ReportSnapshotsResponse.parse((await get('?kind=FINAL')).body);
  expect(list.data).toHaveLength(2);
  expect(list.data.filter((row) => row.supersededAt === null)).toHaveLength(1);
  const read = FullReport.parse((await get(`/${old.id}`)).body);
  expect(read.registrations.total).toBe(1);
  expect(read.snapshot?.supersededAt).not.toBeNull();
  expect(reportReadLabel(read)).toContain('Superseded final report');
  const csv = await get(`/${old.id}/export?format=csv`);
  expect(csv.text).toContain('Superseded final report');
  expect(csv.headers['content-disposition']).toContain('-superseded.csv');
  const currentDefault = await request(app)
    .get(`/api/v1/events/${f.eventId}/reports/summary`)
    .set('Authorization', bearer(f.creator));
  expect(currentDefault.body.snapshot.id).not.toBe(old.id);
  expect(currentDefault.body.registrations.total).toBe(2);
  expect((await get(`?kind=DAILY&cursor=${old.id}`)).status).toBe(404);
});

it.each(['', '/ID', '/ID/export?format=csv'])(
  'requires current report authority for snapshot route %s',
  async (suffix) => {
    const path = suffix.replace('ID', id);
    expect((await request(app).get(`${base()}${path}`)).status).toBe(401);
    const volunteer = await createVolunteer({
      email: 'snapshot-no-read@test.example',
      role: 'VOLUNTEER',
    });
    expect((await get(path, volunteer)).status).toBe(403);
    expect((await get(path)).status).toBe(200);
    await rawDb.eventMembership.update({
      where: { id: f.membershipId },
      data: { role: 'VOLUNTEER' },
    });
    invalidateVolunteerCache(f.creator.sub);
    expect((await get(path)).status).toBe(403);
  },
);

it('treats foreign ids/cursors exactly like missing ones and excludes foreign documents from lists', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: f.eventId } });
  const foreignEvent = await createEvent({
    organisationId: event.organisationId,
    slug: 'snapshot-foreign',
    name: 'Foreign',
    timezone: 'UTC',
    status: 'LIVE',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const foreign = await rawDb.reportSnapshot.create({
    data: {
      eventId: foreignEvent.id,
      kind: 'DAILY',
      lifecycleVersion: 0,
      dedupeKey: 'daily:foreign',
      report: FullReport.parse((await saved()).report),
    },
  });
  for (const suffix of [
    `/${foreign.id}`,
    `/${foreign.id}/export`,
    `?cursor=${foreign.id}`,
    '/missing',
    '/missing/export',
    '?cursor=missing',
  ]) {
    expect((await get(suffix)).status).toBe(404);
  }
  expect(ReportSnapshotsResponse.parse((await get()).body).data.map((row) => row.id)).toEqual([id]);
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${foreignEvent.id}/reports/snapshots`)
        .set('Authorization', bearer(f.creator))
    ).status,
  ).toBe(404);
});

it.each([
  '?limit=0',
  '?limit=51',
  '?kind=OTHER',
  '?eventId=elsewhere',
  '/ID?current=true',
  '/ID?includeRehearsal=true',
  '/ID/export?from=2026-01-01T00:00:00Z',
  '/ID/export?includeRehearsal=true',
  '/ID/export?format=pdf',
])('rejects unsupported snapshot selection %s', async (suffix) => {
  expect((await get(suffix.replace('ID', id))).status).toBe(400);
});

it.each([false, true])(
  'exports only the stored daily document with practice=%s and no visitor sheet',
  async (practice) => {
    await f.registration(true);
    if (practice) {
      await f.create({ includeRehearsal: true });
      expect(await f.run()).toBe('SUCCEEDED');
      id = (await f.snapshots()).find((row) => row.rehearsalIncluded)!.id;
    }
    const registration = await f.registration();
    await rawDb.visitorRecord.create({
      data: {
        eventId: f.eventId,
        registrationId: registration.id,
        rehearsal: false,
        data: { private: 'visitor export sentinel' },
      },
    });
    const csv = await get(`/${id}/export?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['cache-control']).toBe('no-store');
    expect(csv.headers['content-disposition']).toContain(
      `-frozen-daily-${id}${practice ? '-with-rehearsal' : ''}.csv`,
    );
    expect(csv.text).toContain('Frozen daily report');
    expect(csv.text).toContain(
      practice ? 'Includes rehearsal data' : 'Rehearsal data is excluded.',
    );
    expect(csv.text).not.toContain('visitor export sentinel');
    expect(csv.text).not.toContain('## Visitor');
    const xlsx = await get(`/${id}/export`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(xlsx.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.body);
    const contents = JSON.stringify(workbook.worksheets.map((sheet) => sheet.getSheetValues()));
    expect(contents).toContain('Frozen daily report');
    expect(contents).toContain(
      practice ? 'Includes rehearsal data' : 'Rehearsal data is excluded.',
    );
    expect(contents).not.toContain('visitor export sentinel');
    expect(workbook.worksheets.map((sheet) => sheet.name)).not.toContain('Visitor details');
  },
);

it.each(['invalid-body', 'mismatched-practice'])(
  'fails closed on %s instead of generating a current substitute or leaking stored data',
  async (fault) => {
    const invalid = await rawDb.reportSnapshot.create({
      data: {
        eventId: f.eventId,
        kind: 'DAILY',
        lifecycleVersion: 0,
        dedupeKey: `daily:invalid:${fault}`,
        rehearsalIncluded: fault === 'mismatched-practice',
        report:
          fault === 'invalid-body'
            ? { private: 'invalid stored sentinel' }
            : FullReport.parse((await saved()).report),
      },
    });
    for (const suffix of [`/${invalid.id}`, `/${invalid.id}/export?format=csv`]) {
      const response = await get(suffix);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toMatch(/sentinel|Prisma|reportSnapshot|ZodError/);
    }
    if (fault === 'invalid-body') expect((await get()).status).toBe(500);
  },
);
