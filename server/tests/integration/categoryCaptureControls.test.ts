import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { assertActiveCategoryIds } from '../../src/platform/db/categoryCaptureAdmission.js';
import * as categoryRepo from '../../src/modules/registration/data/repo.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let eventId: string;
let categoryId: string;
let stationId: string;
let admin: TestVolunteer;
let fixtureNumber = 0;
const post = (path: string, body: object) =>
  request(app)
    .post(`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(admin))
    .send(body);
const single = () => ({ stationId, category: 'SEC_4', idempotencyKey: idempotencyKey() });
const group = () => ({
  stationId,
  members: [
    { category: 'SEC_4', count: 2 },
    { category: 'OTHER', count: 1 },
  ],
  idempotencyKey: idempotencyKey(),
});
const imported = (commit: boolean) => ({
  source: 'PAPER',
  commit,
  rows: [
    { stationCode: 'CATEGORY', category: 'SEC_4', count: 2, recordedAt: FROZEN_NOW.toISOString() },
  ],
});
const setActive = (active: boolean) =>
  rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
    await tx.captureCategory.update({ where: { eventId, id: categoryId }, data: { active } });
  });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: `category-control-${fixtureNumber++}@test.example`,
    role: 'ADMIN',
  });
  stationId = (await createStation({ code: 'CATEGORY', countsEntry: true })).id;
  categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId, code: 'SEC_4' } }))
    .id;
});

it.each(['LIVE', 'REHEARSAL'] as const)(
  'refuses paused single registrations in %s and resumes immediately',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    await setActive(false);
    const before = await rawDb.auditLog.count({ where: { eventId } });
    const paused = await post('/registrations', single());
    expect(paused.status).toBe(409);
    expect(paused.body.error.message).toContain('category');
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(before);
    await setActive(true);
    expect((await post('/registrations', single())).status).toBe(201);
    expect(await rawDb.registration.findFirst({ where: { eventId } })).toMatchObject({
      rehearsal: status === 'REHEARSAL',
    });
  },
);

it.each(['LIVE', 'REHEARSAL'] as const)(
  'refuses the entire mixed group in %s when one category is paused',
  async (status) => {
    await rawDb.event.update({ where: { id: eventId }, data: { status } });
    await setActive(false);
    const before = await rawDb.auditLog.count({ where: { eventId } });
    expect((await post('/registrations/group', group())).status).toBe(409);
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(before);
    await setActive(true);
    expect((await post('/registrations/group', group())).status).toBe(201);
    const rows = await rawDb.registration.findMany({ where: { eventId } });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.rehearsal === (status === 'REHEARSAL'))).toBe(true);
  },
);

it('rolls back a group card issuance when a category refuses the group', async () => {
  const card = await rawDb.missionCard.create({
    data: { eventId, shortCode: 'CAT111', qrPayload: 'category-card', status: 'UNISSUED' },
  });
  await setActive(false);
  expect(
    (await post('/registrations/group', { ...group(), missionCardShortCode: card.shortCode }))
      .status,
  ).toBe(409);
  expect(await rawDb.missionCard.findUnique({ where: { id: card.id } })).toEqual(card);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
});

it('replays a completed key through deactivation while refusing a new registration', async () => {
  const body = single();
  const original = await post('/registrations', body);
  expect(original.status).toBe(201);
  await setActive(false);
  expect((await post('/registrations', body)).body).toEqual(original.body);
  expect((await post('/registrations', single())).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('hides inactive buttons while retaining their historical count and label in reports', async () => {
  expect((await post('/registrations', single())).status).toBe(201);
  await setActive(false);
  const get = (path: string) =>
    request(app).get(`/api/v1/events/${eventId}${path}`).set('Authorization', bearer(admin));
  const categories = await get('/registrations/categories');
  expect(categories.status).toBe(200);
  expect(JSON.stringify(categories.body)).not.toContain('SEC_4');
  const report = await get('/reports/summary');
  expect(report.status).toBe(200);
  expect(report.body.registrations.total).toBe(1);
  expect(report.body.registrations.byCategory).toEqual(
    expect.arrayContaining([expect.objectContaining({ key: 'SEC_4', value: 1 })]),
  );
});

it('preserves valid CLOSED queue receipts for inactive categories but keeps the bounded grace', async () => {
  await setActive(false);
  const closedAt = new Date(FROZEN_NOW.getTime() - 60_000);
  const clientRecordedAt = new Date(closedAt.getTime() - 1).toISOString();
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED', closedAt } });
  expect((await post('/registrations', { ...single(), clientRecordedAt })).status).toBe(201);
  expect((await post('/registrations/group', { ...group(), clientRecordedAt })).status).toBe(201);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(4);
  expect((await post('/registrations', single())).status).toBe(409);
  expect(
    (await post('/registrations', { ...single(), clientRecordedAt: closedAt.toISOString() }))
      .status,
  ).toBe(409);
  await rawDb.event.update({
    where: { id: eventId },
    data: { closedAt: new Date(FROZEN_NOW.getTime() - 25 * 3600_000) },
  });
  expect(
    (
      await post('/registrations', {
        ...single(),
        clientRecordedAt: new Date(FROZEN_NOW.getTime() - 26 * 3600_000).toISOString(),
      })
    ).status,
  ).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(4);
});

it.each([false, true])(
  'reports an inactive import category as a row issue with commit=%s',
  async (commit) => {
    await setActive(false);
    const response = await post('/fallback/imports/registrations', imported(commit));
    expect(response.status).toBe(commit ? 201 : 200);
    expect(response.body.recordsCreated).toBe(0);
    expect(response.body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'category' })]),
    );
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  },
);

it('retains existing partial-import semantics for an active row beside an inactive-category issue', async () => {
  await setActive(false);
  const body = imported(true);
  body.rows.push({ ...body.rows[0]!, category: 'OTHER', count: 1 });
  const response = await post('/fallback/imports/registrations', body);
  expect(response.status).toBe(201);
  expect(response.body.recordsCreated).toBe(1);
  expect(response.body.issues).toHaveLength(1);
  const rows = await rawDb.registration.findMany({ where: { eventId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]!.categoryId).not.toBe(categoryId);
});

async function waitForEventLock(mode: 'UPDATE' | 'SHARE' | 'CAPTURE_RESERVATION') {
  // HTTP taps reserve their retry first; that insert's Event FK waits before admission.
  const query =
    mode === 'CAPTURE_RESERVATION'
      ? '%INSERT INTO%IdempotencyRecord%'
      : `%FROM "Event"%FOR ${mode}%`;
  await expect
    .poll(async () => {
      const rows = await rawDb.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${query}`;
      return Number(rows[0]!.count);
    })
    .toBeGreaterThan(0);
}

it.each(['tap', 'import'])(
  'a %s waiting behind deactivation sees the committed category state',
  async (kind) => {
    let outcome: Promise<request.Response> | undefined;
    const before = await rawDb.auditLog.count({ where: { eventId } });
    await rawDb.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      outcome = (
        kind === 'tap'
          ? post('/registrations', single())
          : post('/fallback/imports/registrations', imported(true))
      ).then((response) => response);
      await waitForEventLock(kind === 'tap' ? 'CAPTURE_RESERVATION' : 'SHARE');
      await tx.captureCategory.update({
        where: { eventId, id: categoryId },
        data: { active: false },
      });
    });
    expect((await outcome)?.status).toBe(409);
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.importBatch.count({ where: { eventId } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId } })).toBe(before);
  },
);

it('deactivation waits for an already admitted tap, then prevents subsequent taps', async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = categoryRepo.findCategory;
  const spy = vi.spyOn(categoryRepo, 'findCategory').mockImplementationOnce(async (...args) => {
    const row = await original(...args);
    entered();
    await gate;
    return row;
  });
  const capture = post('/registrations', single()).then((response) => response);
  await ready;
  const closing = setActive(false);
  try {
    await waitForEventLock('UPDATE');
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(0);
  } finally {
    release();
    await Promise.all([capture, closing]);
    spy.mockRestore();
  }
  expect((await capture).status).toBe(201);
  expect((await post('/registrations', single())).status).toBe(409);
  expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
});

it('an import category id from another event is refused by the provided-transaction recheck', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await createEvent({
    organisationId: event.organisationId,
    slug: 'category-other',
    name: 'Other',
    timezone: 'UTC',
    status: 'LIVE',
    categories: [{ code: 'SEC_4', label: 'Other label' }],
    stationTypes: [],
    shiftTemplates: [],
  });
  const foreign = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId: other.id } });
  await expect(
    prisma.$transaction((db) => assertActiveCategoryIds({ eventId }, { db, ids: [foreign.id] })),
  ).rejects.toMatchObject({ statusCode: 404 });
});
