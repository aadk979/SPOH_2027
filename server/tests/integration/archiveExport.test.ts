import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArchiveExportResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import {
  useArchiveStorage,
  type ArchiveStorage,
} from '../../src/modules/report/application/archiveStorage.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
  renewFixtureToken,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const objects = new Map<string, Buffer>();
const storage: ArchiveStorage = {
  write: vi.fn(async ({ key, body }) => {
    objects.set(key, body);
  }),
  read: vi.fn(async (key) => objects.get(key) ?? Buffer.from('fixture')),
};
let restore: () => void;
let eventId: string;
let admin: TestVolunteer;
let number = 0;
const create = (key = idempotencyKey(), caller = admin) =>
  request(app)
    .post(`/api/v1/events/${eventId}/reports/archive-export`)
    .set('Authorization', bearer(caller))
    .send({ idempotencyKey: key });
const list = () =>
  request(app)
    .get(`/api/v1/events/${eventId}/reports/archive-exports`)
    .set('Authorization', bearer(admin));
const close = async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  expect(
    (
      await request(app)
        .post(`/api/v1/events/${eventId}/lifecycle`)
        .set('Authorization', bearer(admin))
        .send({
          to: 'CLOSED',
          expectedVersion: event.lifecycleVersion,
          idempotencyKey: idempotencyKey(),
        })
    ).status,
  ).toBe(200);
};
beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
  objects.clear();
  restore = useArchiveStorage(storage);
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: `archive-pack-${number++}@export.test`, role: 'ADMIN' });
});
afterEach(() => restore());

it('stores a frozen final workbook once, lists it after reload and downloads through event authorization', async () => {
  expect((await create()).status).toBe(409);
  await close();
  const key = idempotencyKey();
  const created = await create(key);
  expect(created.status).toBe(201);
  const dto = ArchiveExportResponse.parse(created.body).data;
  expect(dto).toMatchObject({
    eventId,
    createdAt: FROZEN_NOW.toISOString(),
    downloadPath: `/events/${eventId}/reports/archive-export/${dto.id}`,
  });
  expect((await create(key)).body).toEqual(created.body);
  expect(storage.write).toHaveBeenCalledTimes(1);
  expect((await list()).body.data).toEqual([dto]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(objects.get(dto.objectKey)! as never);
  expect(workbook.worksheets.map((sheet) => sheet.name)).toContain('Read me first');
  expect(workbook.worksheets.map((sheet) => sheet.name).join(',')).not.toMatch(/visitor details/i);
  const download = await request(app)
    .get(`/api/v1${dto.downloadPath}`)
    .set('Authorization', bearer(admin));
  expect(download.status).toBe(200);
  expect(download.headers['cache-control']).toBe('no-store');
  expect(download.headers['content-disposition']).toContain(`final-export-${dto.id}.xlsx`);
  expect(await rawDb.auditLog.count({ where: { action: 'report.archiveExport', eventId } })).toBe(
    1,
  );
});

it('refuses missing, superseded and malformed current final report evidence', async () => {
  await close();
  const snapshot = await rawDb.reportSnapshot.findFirstOrThrow({
    where: { eventId, kind: 'FINAL' },
  });
  await rawDb.reportSnapshot.update({
    where: { id: snapshot.id },
    data: { supersededAt: FROZEN_NOW },
  });
  expect((await create()).status).toBe(409);
  await rawDb.reportSnapshot.create({
    data: {
      eventId,
      kind: 'FINAL',
      report: {},
      lifecycleVersion: snapshot.lifecycleVersion + 1,
      dedupeKey: `final:${snapshot.lifecycleVersion + 1}`,
    },
  });
  await rawDb.event.update({
    where: { id: eventId },
    data: { lifecycleVersion: snapshot.lifecycleVersion + 1 },
  });
  expect((await create()).status).toBe(409);
  expect(storage.write).not.toHaveBeenCalled();
});

it('rolls back the export row, receipt and audit when S3 write fails', async () => {
  await close();
  const key = idempotencyKey();
  vi.mocked(storage.write).mockRejectedValueOnce(new Error('Export storage unavailable'));
  expect((await create(key)).status).toBe(500);
  expect(await rawDb.archiveExport.count()).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'report.archiveExport' } })).toBe(0);
  expect((await create(key)).status).toBe(201);
});

it('denies ordinary members and absent or foreign export IDs', async () => {
  const member = await createVolunteer({
    email: `ordinary-${number++}@export.test`,
    role: 'VOLUNTEER',
  });
  expect((await create(idempotencyKey(), member)).status).toBe(403);
  expect(
    (
      await request(app)
        .get(`/api/v1/events/${eventId}/reports/archive-export/missing`)
        .set('Authorization', bearer(admin))
    ).status,
  ).toBe(404);
  expect((await request(app).get(`/api/v1/events/${eventId}/reports/archive-exports`)).status).toBe(
    401,
  );
});

it('requires the pack before archive, preserves it for platform admins and refuses archived writes', async () => {
  await close();
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  await rawDb.organisationMembership.create({
    data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' },
  });
  vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 24 * 3600_000 + 1));
  await renewFixtureToken(admin);
  const archive = () =>
    request(app)
      .post(`/api/v1/events/${eventId}/lifecycle`)
      .set('Authorization', bearer(admin))
      .send({
        to: 'ARCHIVED',
        expectedVersion: event.lifecycleVersion,
        idempotencyKey: idempotencyKey(),
      });
  expect((await archive()).body.error.details.blockers).toContain('final-export');
  const created = await create();
  expect(created.status).toBe(201);
  await rawDb.eventMembership.updateMany({
    where: { eventId, personId: admin.id },
    data: { role: 'VOLUNTEER' },
  });
  expect((await archive()).status).toBe(200);
  expect((await list()).status).toBe(200);
  expect((await create()).status).toBe(403);
  expect(await rawDb.scheduledAction.count({ where: { eventId, type: 'retention.staff' } })).toBe(
    1,
  );
});
