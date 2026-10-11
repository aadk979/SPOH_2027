import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CardPrintExportDetailResponse,
  CardPrintExportListResponse,
  ERROR_CODES,
  type CardPrintContextRecord,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { invalidateEventCache } from '../../src/platform/event/events.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  makePlatformAdmin,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
const printedAt = new Date('2027-01-07T03:00:00.000Z');
const frozenContext: CardPrintContextRecord = {
  eventName: 'Open day at printing 开放日 தமிழ்',
  stampingStations: [{ id: 'historical-station', name: 'Original stamping station' }],
  batches: [
    { shortCode: 'ABC123', batchLabel: 'Morning 印刷 தமிழ்' },
    { shortCode: 'ABC124', batchLabel: null },
  ],
};
let eventId: string;
let admin: TestVolunteer;
const base = () => `/api/v1/events/${eventId}/cards/print`;
const get = (suffix = '', actor: TestVolunteer = admin) =>
  request(app).get(`${base()}${suffix}`).set('Authorization', bearer(actor));
const exportRow = (
  id = 'history-main',
  createdAt = printedAt,
  rowEventId = eventId,
  context = frozenContext,
) =>
  rawDb.cardPrintExport.create({
    data: {
      id,
      eventId: rowEventId,
      objectKey: `private-print-storage/${id}.pdf`,
      format: 'pdf',
      count: 2,
      shortCodes: ['ABC123', 'ABC124'],
      printContext: context,
      rehearsal: false,
      createdAt,
    },
  });

beforeEach(async () => {
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  admin = await createVolunteer({
    email: 'history-owner@print.test',
    displayName: 'Private print actor sentinel',
    role: 'ADMIN',
  });
});

describe('private print history reads', () => {
  it('returns an empty collection before any export exists', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(CardPrintExportListResponse.parse(response.body)).toEqual({
      data: [],
      meta: { count: 0, nextCursor: null },
    });
  });

  it('pages tied creation times without duplicates and excludes newer inserts from a continued page', async () => {
    const tie = new Date(printedAt.getTime() + 1000);
    await exportRow('history-old');
    await exportRow('history-tie-a', tie);
    await exportRow('history-tie-b', tie);
    await exportRow('history-tie-c', tie);
    const first = await get('?limit=2');
    expect(first.status).toBe(200);
    const page = CardPrintExportListResponse.parse(first.body);
    expect(page.data.map((row) => row.id)).toEqual(['history-tie-c', 'history-tie-b']);
    expect(page.meta).toEqual({ count: 2, nextCursor: 'history-tie-b' });
    await exportRow('history-new', new Date(tie.getTime() + 1));
    const second = await get(`?limit=2&cursor=${page.meta.nextCursor}`);
    expect(second.status).toBe(200);
    const continued = CardPrintExportListResponse.parse(second.body);
    expect(continued.data.map((row) => row.id)).toEqual(['history-tie-a', 'history-old']);
    expect(continued.meta).toEqual({ count: 2, nextCursor: null });
    expect(new Set([...page.data, ...continued.data].map((row) => row.id)).size).toBe(4);
    const latest = CardPrintExportListResponse.parse((await get('?limit=1')).body);
    expect(latest.data[0]!.id).toBe('history-new');
  });

  it('defaults to a bounded page and accepts the documented upper limit', async () => {
    await rawDb.cardPrintExport.createMany({
      data: Array.from({ length: 53 }, (_, index) => ({
        id: `history-bound-${String(index).padStart(3, '0')}`,
        eventId,
        objectKey: `private-print-storage/bound-${index}.zip`,
        format: 'zip',
        count: 1,
        rehearsal: true,
        createdAt: printedAt,
      })),
    });
    const response = await get();
    expect(response.status).toBe(200);
    const first = CardPrintExportListResponse.parse(response.body);
    expect(first.data).toHaveLength(50);
    expect(first.meta).toEqual({ count: 50, nextCursor: 'history-bound-003' });
    const next = CardPrintExportListResponse.parse(
      (await get(`?cursor=${first.meta.nextCursor}`)).body,
    );
    expect(next.data.map((row) => row.id)).toEqual([
      'history-bound-002',
      'history-bound-001',
      'history-bound-000',
    ]);
    expect(next.meta.nextCursor).toBeNull();
    const upper = await get('?limit=200');
    expect(upper.status).toBe(200);
    expect(CardPrintExportListResponse.parse(upper.body).meta).toEqual({
      count: 53,
      nextCursor: null,
    });
  });

  it.each([
    '?limit=0',
    '?limit=201',
    '?limit=1.5',
    '?limit=invalid',
    '?cursor=',
    `?cursor=${'x'.repeat(65)}`,
    '?eventId=other-event',
    '?rehearsal=true',
    '?format=pdf',
    '?limit=1&limit=2',
  ])('rejects unsupported or unbounded history selection %s', async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
  });

  it('excludes foreign exports and treats foreign ids and cursors like missing ones', async () => {
    const own = await exportRow();
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const foreignEvent = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'foreign-print-history',
        name: 'Foreign print event',
        timezone: event.timezone,
      },
    });
    const foreign = await exportRow('history-foreign', new Date(), foreignEvent.id);
    for (const suffix of [
      `/${foreign.id}/details`,
      '/history-missing/details',
      `?cursor=${foreign.id}`,
      '?cursor=history-missing',
    ]) {
      const response = await get(suffix);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(foreign.objectKey);
    }
    const list = CardPrintExportListResponse.parse((await get()).body);
    expect(list.data.map((row) => row.id)).toEqual([own.id]);
    expect(
      (
        await request(app)
          .get(`/api/v1/events/${foreignEvent.id}/cards/print`)
          .set('Authorization', bearer(admin))
      ).status,
    ).toBe(404);
  });

  it.each(['ADMIN', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR', 'LEAD'] as const)(
    'lets a current %s read history and frozen details through Report.Export',
    async (role) => {
      const row = await exportRow();
      const reader = await createVolunteer({ email: `history-${role}@print.test`, role });
      for (const suffix of ['', `/${row.id}/details`]) {
        const response = await get(suffix, reader);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
      }
    },
  );

  it.each(['IC', 'VOLUNTEER'] as const)('refuses history and details to a %s', async (role) => {
    const row = await exportRow();
    const reader = await createVolunteer({ email: `history-denied-${role}@print.test`, role });
    for (const suffix of ['', `/${row.id}/details`]) {
      expect((await get(suffix, reader)).status).toBe(403);
      expect((await request(app).get(`${base()}${suffix}`)).status).toBe(401);
    }
  });

  it('rechecks current membership authority rather than trusting an older token role', async () => {
    const row = await exportRow();
    expect((await get(`/${row.id}/details`)).status).toBe(200);
    await rawDb.eventMembership.update({
      where: { eventId_personId: { eventId, personId: admin.id } },
      data: { role: 'VOLUNTEER' },
    });
    invalidateVolunteerCache(admin.sub);
    expect((await get()).status).toBe(403);
    expect((await get(`/${row.id}/details`)).status).toBe(403);
  });

  it('retains archived history for an ended owning-organisation platform admin and denies other ended readers', async () => {
    const row = await exportRow();
    const ordinary = await createVolunteer({ email: 'history-ended@print.test', role: 'LEAD' });
    const foreignAdmin = await createVolunteer({
      email: 'history-foreign-admin@print.test',
      role: 'ADMIN',
    });
    await makePlatformAdmin(admin.id);
    const foreignOrganisation = await rawDb.organisation.create({
      data: {
        slug: 'foreign-print-organisation',
        name: 'Foreign print organisation',
        appName: 'Foreign ops',
        defaultTimezone: 'UTC',
      },
    });
    await rawDb.organisationMembership.create({
      data: {
        organisationId: foreignOrganisation.id,
        personId: foreignAdmin.id,
        role: 'PLATFORM_ADMIN',
      },
    });
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED' } });
    invalidateVolunteerCache();
    invalidateEventCache();
    for (const suffix of ['', `/${row.id}/details`]) {
      const response = await get(suffix);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect((await get(suffix, ordinary)).status).toBe(403);
      expect((await get(suffix, foreignAdmin)).status).toBe(403);
    }
  });

  it('returns only frozen selected codes and labels after live rows are changed or removed', async () => {
    const station = await createStation({
      code: 'HISTORY',
      name: 'Original station',
      issuesStamp: true,
    });
    const context = {
      ...frozenContext,
      stampingStations: [{ id: station.id, name: 'Original station' }],
    };
    const row = await exportRow('history-frozen', printedAt, eventId, context);
    await rawDb.missionCard.createMany({
      data: ['ABC123', 'ABC124'].map((shortCode) => ({
        eventId,
        shortCode,
        qrPayload: `opaque-private-qr:${shortCode}`,
        batchLabel: 'Changed current batch',
      })),
    });
    const before = await get(`/${row.id}/details`);
    expect(before.status).toBe(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(CardPrintExportDetailResponse.parse(before.body)).toEqual({
      data: {
        id: row.id,
        format: 'pdf',
        count: 2,
        rehearsal: false,
        createdAt: printedAt.toISOString(),
        shortCodes: ['ABC123', 'ABC124'],
        printContext: context,
      },
    });
    await rawDb.event.update({ where: { id: eventId }, data: { name: 'Renamed event' } });
    await rawDb.station.update({ where: { id: station.id }, data: { name: 'Renamed station' } });
    await rawDb.missionCard.deleteMany({ where: { eventId } });
    const auditCount = await rawDb.auditLog.count();
    const after = await get(`/${row.id}/details`);
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before.body);
    const listResponse = await get();
    expect(listResponse.status).toBe(200);
    expect(listResponse.headers['cache-control']).toBe('no-store');
    const list = CardPrintExportListResponse.parse(listResponse.body);
    expect(list.data).toEqual([
      {
        id: row.id,
        format: 'pdf',
        count: 2,
        rehearsal: false,
        createdAt: printedAt.toISOString(),
      },
    ]);
    const serialised = JSON.stringify({ list, detail: after.body });
    expect(serialised).not.toMatch(/objectKey|qrPayload|eventId|actor|email|cognitoSub|createdBy/);
    expect(serialised).not.toContain(row.objectKey);
    expect(serialised).not.toContain(admin.email);
    expect(serialised).not.toContain('Private print actor sentinel');
    expect(serialised).not.toContain('opaque-private-qr');
    expect(await rawDb.cardPrintExport.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(await rawDb.auditLog.count()).toBe(auditCount);
  });

  it('represents legacy unknown metadata explicitly instead of reconstructing current configuration', async () => {
    const legacy = await rawDb.cardPrintExport.create({
      data: {
        id: 'history-legacy',
        eventId,
        objectKey: 'private-print-storage/legacy.zip',
        format: 'zip',
        count: 7,
        rehearsal: true,
        createdAt: printedAt,
      },
    });
    await createStation({ code: 'NOW', name: 'A station configured later', issuesStamp: true });
    const response = await get(`/${legacy.id}/details`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(CardPrintExportDetailResponse.parse(response.body)).toEqual({
      data: {
        id: legacy.id,
        format: 'zip',
        count: 7,
        rehearsal: true,
        createdAt: printedAt.toISOString(),
        shortCodes: [],
        printContext: null,
      },
    });
    expect(await rawDb.cardPrintExport.findUnique({ where: { id: legacy.id } })).toEqual(legacy);
  });
});
