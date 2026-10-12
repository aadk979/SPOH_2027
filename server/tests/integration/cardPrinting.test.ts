import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { useCardPrintStorage } from '../../src/modules/missionCard/application/printStorage.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { printedPdfText } from '../helpers/cardPdfText.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { invalidateEventCache } from '../../src/platform/event/events.js';
import * as printRepo from '../../src/modules/missionCard/data/printRepo.js';

const app = createApp();
let admin: TestVolunteer;
let eventId: string;
let restore: (() => void) | undefined;
let objects: Map<string, Buffer>;
const post = (actor: TestVolunteer, body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}/cards/print`)
    .set('Authorization', bearer(actor))
    .send(body);
beforeEach(async () => {
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  admin = await createVolunteer({ email: 'printer@print.test', role: 'ADMIN' });
  objects = new Map();
  restore = useCardPrintStorage({
    async write({ key, body }) {
      objects.set(key, body);
    },
    async read(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('missing object');
      return bytes;
    },
  });
  await rawDb.missionCard.createMany({
    data: [
      {
        eventId,
        shortCode: 'ABC123',
        qrPayload: 'opaque:print-one',
        status: 'UNISSUED',
        rehearsal: false,
      },
      {
        eventId,
        shortCode: 'ABC124',
        qrPayload: 'opaque:print-two',
        status: 'UNISSUED',
        rehearsal: true,
      },
      {
        eventId,
        shortCode: 'ABC125',
        qrPayload: 'opaque:print-three',
        status: 'ISSUED',
        rehearsal: false,
      },
    ],
  });
});
afterEach(() => {
  restore?.();
  vi.restoreAllMocks();
});
describe('private card print exports', () => {
  it.each(['pdf', 'zip'])(
    'stores a %s privately, audits its receipt and replays without creating another object',
    async (format) => {
      const body = { idempotencyKey: idempotencyKey(), shortCodes: ['ABC123'], format };
      const response = await post(admin, body);
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ count: 1, rehearsal: false, format });
      expect(response.body.data.objectKey).toBeUndefined();
      expect((await post(admin, body)).body).toEqual(response.body);
      expect(objects.size).toBe(1);
      expect(await rawDb.cardPrintExport.count()).toBe(1);
      expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(1);
      const download = await request(app)
        .get(`/api/v1/events/${eventId}/cards/print/${response.body.data.id}`)
        .set('Authorization', bearer(admin));
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain(
        format === 'pdf' ? 'application/pdf' : 'application/zip',
      );
      expect(download.headers['cache-control']).toBe('no-store');
      expect(download.headers['content-disposition']).toContain(`.${format}`);
    },
  );
  it.each([
    { codes: ['ABC123', 'ABC124'], status: 409 },
    { codes: ['ABC125'], status: 409 },
    { codes: ['XYZ123'], status: 404 },
    { codes: ['ABC123', 'ABC123'], status: 400 },
  ])(
    'refuses an invalid selection $codes without publishing an export',
    async ({ codes, status }) => {
      const response = await post(admin, {
        idempotencyKey: idempotencyKey(),
        shortCodes: codes,
        format: 'pdf',
      });
      expect(response.status).toBe(status);
      expect(objects.size).toBe(0);
      expect(await rawDb.cardPrintExport.count()).toBe(0);
    },
  );
  it('does not commit a receipt or audit when storage fails, and a retry can succeed', async () => {
    restore?.();
    restore = useCardPrintStorage({
      async write() {
        throw new Error('storage unavailable');
      },
      async read() {
        return new Uint8Array();
      },
    });
    const body = { idempotencyKey: idempotencyKey(), shortCodes: ['ABC123'], format: 'pdf' };
    expect((await post(admin, body)).status).toBe(500);
    expect(await rawDb.cardPrintExport.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(0);
    restore();
    restore = useCardPrintStorage({
      async write({ key, body }) {
        objects.set(key, body);
      },
      async read(key) {
        return objects.get(key)!;
      },
    });
    expect((await post(admin, body)).status).toBe(201);
  });
  it('refuses volunteers and unauthenticated downloads', async () => {
    const member = await createVolunteer({ email: 'member@print.test', role: 'VOLUNTEER' });
    expect(
      (
        await post(member, {
          idempotencyKey: idempotencyKey(),
          shortCodes: ['ABC123'],
          format: 'pdf',
        })
      ).status,
    ).toBe(403);
    expect((await request(app).get(`/api/v1/events/${eventId}/cards/print/missing`)).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .get(`/api/v1/events/${eventId}/cards/print/missing`)
          .set('Authorization', bearer(admin))
      ).status,
    ).toBe(404);
  });
  it('freezes sorted selected codes, event, batch and active stamping-station labels independently of later changes', async () => {
    await rawDb.event.update({ where: { id: eventId }, data: { name: 'Open day 开放日 தமிழ்' } });
    await rawDb.missionCard.updateMany({
      where: { eventId, shortCode: 'ABC123' },
      data: { batchLabel: '印刷批次 தமிழ்' },
    });
    await rawDb.missionCard.create({
      data: {
        eventId,
        shortCode: 'ABC126',
        qrPayload: 'opaque:print-four',
        batchLabel: 'Afternoon',
        status: 'UNISSUED',
      },
    });
    const station = await createStation({
      code: 'STAMP',
      name: '课程体验站 தமிழ் நிலையம்',
      issuesStamp: true,
    });
    await createStation({
      code: 'INACTIVE',
      name: 'Inactive stamp',
      issuesStamp: true,
      active: false,
    });
    await createStation({ code: 'COUNT', name: 'Count only', countsEntry: true });
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const other = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'other-print-event',
        name: 'Other event',
        timezone: event.timezone,
      },
    });
    const otherType = await rawDb.stationType.create({
      data: { eventId: other.id, code: 'STAMP', label: 'Stamp', issuesStamp: true },
    });
    await rawDb.station.create({
      data: { eventId: other.id, code: 'OTHER', name: 'Other event stamp', typeId: otherType.id },
    });
    const body = {
      idempotencyKey: idempotencyKey(),
      shortCodes: ['ABC126', 'ABC123'],
      format: 'pdf',
    };
    const response = await post(admin, body);
    expect(response.status).toBe(201);
    const row = await rawDb.cardPrintExport.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });
    expect(row.shortCodes).toEqual(['ABC123', 'ABC126']);
    expect(row.printContext).toEqual({
      eventName: event.name,
      branding: {
        schemaVersion: 1,
        publicationId: null,
        publicationVersion: null,
        accent: '#0066cc',
        logo: null,
      },
      stampingStations: [{ id: station.id, name: '课程体验站 தமிழ் நிலையம்' }],
      batches: [
        { shortCode: 'ABC123', batchLabel: '印刷批次 தமிழ்' },
        { shortCode: 'ABC126', batchLabel: 'Afternoon' },
      ],
    });
    const text = await printedPdfText(objects.get(row.objectKey)!);
    expect(text).toContain('开放日');
    expect(text).toContain('தமிழ்');
    expect(text).toContain('印刷批次');
    expect(text.replace(/\s/gu, '')).toContain('课程体验站தமிழ்நிலையம்');
    expect(text).not.toContain('Inactive stamp');
    expect(text).not.toContain('Count only');
    expect(text).not.toContain('Other event stamp');
    await rawDb.event.update({ where: { id: eventId }, data: { name: 'Renamed after printing' } });
    await rawDb.station.update({ where: { id: station.id }, data: { name: 'Renamed stamp' } });
    await rawDb.missionCard.updateMany({
      where: { eventId },
      data: { batchLabel: 'Changed', status: 'ISSUED' },
    });
    expect((await post(admin, body)).body).toEqual(response.body);
    expect(await rawDb.cardPrintExport.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(objects.size).toBe(1);
    const receipt = await rawDb.idempotencyRecord.findUniqueOrThrow({
      where: { key: body.idempotencyKey },
    });
    expect(receipt.statusCode).toBe(201);
    expect(receipt.responseBody).toEqual(response.body);
  });
  it.each(['CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR', 'LEAD', 'ADMIN'] as const)(
    'lets a %s download an existing export through Report.Export',
    async (role) => {
      const response = await post(admin, {
        idempotencyKey: idempotencyKey(),
        shortCodes: ['ABC123'],
        format: 'pdf',
      });
      const reader = await createVolunteer({ email: `${role.toLowerCase()}@print.test`, role });
      expect(
        (
          await request(app)
            .get(`/api/v1/events/${eventId}/cards/print/${response.body.data.id}`)
            .set('Authorization', bearer(reader))
        ).status,
      ).toBe(200);
      if (role === 'LEAD' || role === 'DEPUTY_COORDINATOR')
        expect(
          (
            await post(reader, {
              idempotencyKey: idempotencyKey(),
              shortCodes: ['ABC123'],
              format: 'pdf',
            })
          ).status,
        ).toBe(403);
    },
  );
  it('preserves archived downloads for an ended owning-organisation platform admin while refusing print writes and ordinary ended readers', async () => {
    const response = await post(admin, {
      idempotencyKey: idempotencyKey(),
      shortCodes: ['ABC123'],
      format: 'pdf',
    });
    const reader = await createVolunteer({ email: 'ended-lead@print.test', role: 'LEAD' });
    const event = await rawDb.event.update({
      where: { id: eventId },
      data: { status: 'ARCHIVED' },
    });
    await rawDb.organisationMembership.create({
      data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
    });
    await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED' } });
    invalidateVolunteerCache();
    invalidateEventCache();
    const path = `/api/v1/events/${eventId}/cards/print/${response.body.data.id}`;
    expect((await request(app).get(path).set('Authorization', bearer(admin))).status).toBe(200);
    expect((await request(app).get(path).set('Authorization', bearer(reader))).status).toBe(403);
    expect(
      (
        await post(admin, {
          idempotencyKey: idempotencyKey(),
          shortCodes: ['ABC123'],
          format: 'pdf',
        })
      ).status,
    ).toBe(403);
    expect(objects.size).toBe(1);
  });
  it('rolls back metadata, audit and durable success receipt after an upload when the database write fails', async () => {
    vi.spyOn(printRepo, 'savePrintExport').mockRejectedValueOnce(
      new Error('database unavailable after upload'),
    );
    const body = { idempotencyKey: idempotencyKey(), shortCodes: ['ABC123'], format: 'pdf' };
    expect((await post(admin, body)).status).toBe(500);
    expect(objects.size).toBe(1);
    expect(await rawDb.cardPrintExport.count()).toBe(0);
    expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(0);
    expect(
      await rawDb.idempotencyRecord.count({ where: { key: body.idempotencyKey, statusCode: 201 } }),
    ).toBe(0);
    expect((await post(admin, body)).status).toBe(201);
    expect(objects.size).toBe(2);
    expect(await rawDb.cardPrintExport.count()).toBe(1);
    expect(await rawDb.auditLog.count({ where: { action: 'card.print' } })).toBe(1);
  });
  it('retains unknown metadata for legacy exports and downloads their exact historical bytes', async () => {
    const row = await rawDb.cardPrintExport.create({
      data: {
        id: 'legacy-print',
        createdAt: new Date(),
        eventId,
        objectKey: 'card-print/legacy.pdf',
        format: 'pdf',
        count: 1,
        rehearsal: false,
      },
    });
    objects.set(row.objectKey, Buffer.from('historical-export-bytes'));
    expect(row.shortCodes).toEqual([]);
    expect(row.printContext).toEqual({});
    const response = await request(app)
      .get(`/api/v1/events/${eventId}/cards/print/${row.id}`)
      .set('Authorization', bearer(admin));
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('historical-export-bytes');
    expect(await rawDb.cardPrintExport.findUnique({ where: { id: row.id } })).toEqual(row);
  });
});
