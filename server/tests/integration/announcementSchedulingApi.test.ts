import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  AnnouncementPublicationScheduleRecord,
  ScheduleAnnouncementDraftRequest,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { createPublicationSchedule } from '../../src/modules/announcement/application/createPublicationSchedule.js';
import * as draftRepo from '../../src/modules/announcement/data/draftRepo.js';
import * as scheduleRepo from '../../src/modules/announcement/data/publicationScheduleRepo.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as audit from '../../src/platform/audit/index.js';
import * as retry from '../../src/platform/idempotency/index.js';
import * as push from '../../src/modules/notification/application/webPush.js';
import { fixedClock } from '../../src/platform/time/index.js';
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
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const at = (offset: number) => new Date(FROZEN_NOW.getTime() + offset);
const content = {
  body: 'Private scheduled API content',
  priority: 'INFO',
  requiresAck: false,
  target: {},
};
let eventId: string;
let author: TestVolunteer;
let membershipId: string;
const base = () => `/api/v1/events/${eventId}/announcements`;
const save = async (patch = {}) => {
  const response = await request(app)
    .post(`${base()}/drafts`)
    .set('Authorization', bearer(author))
    .send({ ...content, idempotencyKey: idempotencyKey(), ...patch });
  expect(response.status).toBe(201);
  return response.body.draft as { id: string; version: number };
};
const schedule = (draftId: string, patch = {}, actor = author) =>
  request(app)
    .post(`${base()}/drafts/${draftId}/schedules`)
    .set('Authorization', bearer(actor))
    .send({
      expectedVersion: 1,
      runAt: at(60_000).toISOString(),
      idempotencyKey: idempotencyKey(),
      ...patch,
    });
const read = (draftId: string, scheduleId: string, actor = author) =>
  request(app)
    .get(`${base()}/drafts/${draftId}/schedules/${scheduleId}`)
    .set('Authorization', bearer(actor));
const actions = () => rawDb.scheduledAction.findMany({ where: { type: 'announcement.publish' } });
const receipts = () => rawDb.auditLog.findMany({ where: { action: 'schedule.create' } });
const tick = async (instant = at(60_000)) => {
  const worker = await startScheduledJobs(fixedClock(instant));
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
};

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  author = await createVolunteer({ email: 'publication-api-author@test.example', role: 'ADMIN' });
  membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: author.id } })
  ).id;
});

it('creates an attributed private one-off with metadata-only audit and id-only receipt, without publishing early', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const network = vi.spyOn(push, 'sendPush');
  const response = await schedule(draft.id, { idempotencyKey: key });
  expect(response.status).toBe(201);
  expect(response.headers['cache-control']).toBe('no-store');
  const dto = AnnouncementPublicationScheduleRecord.parse(response.body.schedule);
  expect(dto).toMatchObject({
    eventId,
    draftId: draft.id,
    draftVersion: 1,
    status: 'PENDING',
    version: 1,
    runAt: at(60_000).toISOString(),
    scheduledFor: at(60_000).toISOString(),
    createdAt: FROZEN_NOW.toISOString(),
    completedAt: null,
    lastError: null,
  });
  expect(await actions()).toMatchObject([
    {
      id: dto.id,
      eventId,
      createdByPersonId: author.id,
      type: 'announcement.publish',
      payload: { draftId: draft.id, expectedVersion: 1 },
      recurrence: null,
      attempts: 0,
      lockedBy: null,
      runAt: at(60_000),
      scheduledFor: at(60_000),
    },
  ]);
  expect(await receipts()).toMatchObject([
    {
      eventId,
      actorId: author.id,
      actorSub: author.sub,
      membershipId,
      source: 'USER',
      scheduledActionId: null,
      entityId: dto.id,
    },
  ]);
  expect(JSON.stringify(await receipts())).not.toContain(content.body);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).responseBody,
  ).toEqual({ scheduledActionId: dto.id, draftId: draft.id });
  expect((await read(draft.id, dto.id)).body.schedule).toEqual(dto);
  expect((await read(draft.id, dto.id)).headers['cache-control']).toBe('no-store');
  await tick(at(59_999));
  expect(await rawDb.announcement.count()).toBe(0);
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  expect((await request(app).get(base()).set('Authorization', bearer(author))).body.data).toEqual(
    [],
  );
  expect(network).not.toHaveBeenCalled();
});

it('publishes through the real worker and rebuilds current completed status on a retry', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const first = await schedule(draft.id, { idempotencyKey: key });
  expect(first.status).toBe(201);
  await tick();
  const current = await read(draft.id, first.body.schedule.id);
  expect(current.status).toBe(200);
  expect(current.body.schedule).toMatchObject({
    status: 'SUCCEEDED',
    version: 3,
    completedAt: at(60_000).toISOString(),
  });
  const replay = await schedule(draft.id, { idempotencyKey: key });
  expect(replay.status).toBe(201);
  expect(replay.body.schedule).toEqual(current.body.schedule);
  expect(await actions()).toHaveLength(1);
  expect(await receipts()).toHaveLength(1);
  expect(await rawDb.announcement.count()).toBe(1);
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  const published = (
    await request(app).get(`${base()}/drafts/${draft.id}`).set('Authorization', bearer(author))
  ).body.draft;
  expect(published).toMatchObject({ publishedAt: at(60_000).toISOString() });
  expect(
    (await request(app).get(base()).set('Authorization', bearer(author))).body.data,
  ).toMatchObject([{ id: published.publishedAnnouncementId, body: content.body }]);
  expect((await schedule(draft.id)).status).toBe(409);
});

it('reuses the original action for a changed request body and rejects a key moved to another draft or actor', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const first = await schedule(draft.id, { idempotencyKey: key });
  expect(
    (await schedule(draft.id, { idempotencyKey: key, runAt: at(120_000).toISOString() })).body
      .schedule,
  ).toEqual(first.body.schedule);
  const second = await save();
  expect((await schedule(second.id, { idempotencyKey: key })).status).toBe(409);
  const other = await createVolunteer({ email: 'schedule-key-other@test.example', role: 'ADMIN' });
  expect((await schedule(draft.id, { idempotencyKey: key }, other)).status).toBe(409);
  expect(await actions()).toHaveLength(1);
  expect(await receipts()).toHaveLength(1);
});

it('keeps ownership private and binds a status read to its own draft', async () => {
  const draft = await save();
  const row = (await schedule(draft.id)).body.schedule;
  const other = await createVolunteer({
    email: 'schedule-private-other@test.example',
    role: 'ADMIN',
  });
  expect((await schedule(draft.id, {}, other)).status).toBe(404);
  expect((await read(draft.id, row.id, other)).status).toBe(404);
  const second = await save();
  expect((await read(second.id, row.id)).status).toBe(404);
  expect((await read(draft.id, idempotencyKey())).status).toBe(404);
  expect((await schedule(idempotencyKey())).status).toBe(404);
});

it('does not expose or create a schedule through another event membership', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const row = (await schedule(draft.id, { idempotencyKey: key })).body.schedule;
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await createEvent({
    organisationId: event.organisationId,
    slug: 'publication-api-other',
    name: 'Other',
    timezone: event.timezone,
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: author.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  const path = `/api/v1/events/${other.id}/announcements/drafts/${draft.id}/schedules`;
  expect(
    (await request(app).get(`${path}/${row.id}`).set('Authorization', bearer(author))).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(path)
        .set('Authorization', bearer(author))
        .send({
          expectedVersion: 1,
          runAt: at(60_000).toISOString(),
          idempotencyKey: idempotencyKey(),
        })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post(path)
        .set('Authorization', bearer(author))
        .send({ expectedVersion: 1, runAt: at(60_000).toISOString(), idempotencyKey: key })
    ).status,
  ).toBe(409);
});

it('requires authentication and the current announcement capability on both routes', async () => {
  const draft = await save();
  const row = (await schedule(draft.id)).body.schedule;
  const volunteer = await createVolunteer({
    email: 'schedule-volunteer@test.example',
    role: 'VOLUNTEER',
  });
  const path = `${base()}/drafts/${draft.id}/schedules`;
  expect((await request(app).post(path).send({})).status).toBe(401);
  expect((await request(app).get(`${path}/${row.id}`)).status).toBe(401);
  expect((await schedule(draft.id, {}, volunteer)).status).toBe(403);
  expect((await read(draft.id, row.id, volunteer)).status).toBe(403);
});

it('rechecks IC station authority before creating a schedule', async () => {
  const day = await createEventDayToday();
  const station = await createStation({ code: 'SCHEDULE-STATION' });
  const stationDraft = await save({ target: { stationId: station.id } });
  const eventDraft = await save();
  await rawDb.eventMembership.update({ where: { id: membershipId }, data: { role: 'IC' } });
  expect((await schedule(stationDraft.id)).status).toBe(403);
  await assignToStationAllBlocks({
    volunteerId: author.id,
    stationId: station.id,
    eventDayId: day.id,
  });
  expect((await schedule(stationDraft.id)).status).toBe(201);
  expect((await schedule(eventDraft.id)).status).toBe(403);
});

it.each([0, -1, 60_000, 60_001])(
  'refuses past/inclusive expiry publication time offset %s',
  async (offset) => {
    const draft = await save({ expiresAt: at(60_000).toISOString() });
    expect((await schedule(draft.id, { runAt: at(offset).toISOString() })).status).toBe(409);
    expect(await actions()).toHaveLength(0);
    expect(await receipts()).toHaveLength(0);
  },
);

it('refuses a stale reviewed version, an expired draft and an archived event', async () => {
  const draft = await save({ expiresAt: at(120_000).toISOString() });
  const edited = await request(app)
    .put(`${base()}/drafts/${draft.id}`)
    .set('Authorization', bearer(author))
    .send({
      ...content,
      body: 'Corrected',
      expectedVersion: 1,
      expiresAt: at(120_000).toISOString(),
    });
  expect(edited.status).toBe(200);
  expect((await schedule(draft.id)).status).toBe(409);
  vi.setSystemTime(at(120_000));
  expect(
    (await schedule(draft.id, { expectedVersion: 2, runAt: at(180_000).toISOString() })).status,
  ).toBe(409);
  vi.setSystemTime(FROZEN_NOW);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect((await schedule(draft.id, { expectedVersion: 2 })).status).toBe(409);
  expect(await actions()).toHaveLength(0);
});

it.each([
  { createdByPersonId: 'injected' },
  { eventId: 'injected' },
  { type: 'event.transition' },
  { body: 'Unreviewed text' },
  { recurrence: { cron: '*' } },
  { maxAttempts: 99 },
  { expiresAt: at(90_000).toISOString() },
  { expectedVersion: 0 },
  { runAt: 'not-time' },
  { idempotencyKey: 'not-key' },
])('refuses injected or malformed request %j', async (patch) => {
  const draft = await save();
  expect((await schedule(draft.id, patch)).status).toBe(400);
  expect(await actions()).toHaveLength(0);
});

it('returns a bounded public error without persisted exceptions, payloads or leases', async () => {
  const draft = await save();
  const row = (await schedule(draft.id)).body.schedule;
  await rawDb.scheduledAction.update({
    where: { id: row.id },
    data: {
      status: 'FAILED',
      completedAt: FROZEN_NOW,
      lastError: 'Raw credentials and private exception',
    },
  });
  const response = await read(draft.id, row.id);
  expect(response.status).toBe(200);
  expect(AnnouncementPublicationScheduleRecord.parse(response.body.schedule).lastError).toBe(
    'EXECUTION_FAILED',
  );
  expect(JSON.stringify(response.body)).not.toContain('Raw credentials');
  expect(response.body.schedule).not.toHaveProperty('payload');
  expect(response.body.schedule).not.toHaveProperty('lockedBy');
});

it.each(['audit', 'receipt', 'insert'] as const)(
  'rolls back action and metadata when %s fails, then permits a clean retry',
  async (failure) => {
    const draft = await save();
    const key = idempotencyKey();
    if (failure === 'audit')
      vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Audit unavailable'));
    if (failure === 'receipt')
      vi.spyOn(retry, 'settleReserved').mockRejectedValueOnce(new Error('Receipt unavailable'));
    if (failure === 'insert')
      vi.spyOn(scheduleRepo, 'insertPublicationSchedule').mockRejectedValueOnce(
        new Error('Insert unavailable'),
      );
    expect((await schedule(draft.id, { idempotencyKey: key })).status).toBe(500);
    expect(await actions()).toHaveLength(0);
    expect(await receipts()).toHaveLength(0);
    expect(await rawDb.idempotencyRecord.findUnique({ where: { key } })).toBeNull();
    expect((await schedule(draft.id, { idempotencyKey: key })).status).toBe(201);
  },
);

it('retains the atomic receipt when HTTP bookkeeping fails', async () => {
  const draft = await save();
  const key = idempotencyKey();
  vi.spyOn(retry, 'settle').mockRejectedValueOnce(new Error('HTTP bookkeeping unavailable'));
  const first = await schedule(draft.id, { idempotencyKey: key });
  expect(first.status).toBe(201);
  expect((await schedule(draft.id, { idempotencyKey: key })).body.schedule).toEqual(
    first.body.schedule,
  );
  expect(await actions()).toHaveLength(1);
  expect(await receipts()).toHaveLength(1);
});

it('replays the same action across the event route and legacy alias', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const first = await schedule(draft.id, { idempotencyKey: key });
  expect(first.status).toBe(201);
  const response = await request(app)
    .post(`/api/v1/announcements/drafts/${draft.id}/schedules`)
    .set('Authorization', bearer(author))
    .send({ expectedVersion: 1, runAt: at(60_000).toISOString(), idempotencyKey: key });
  expect(response.status).toBe(201);
  expect(response.body.schedule).toEqual(first.body.schedule);
  expect(await actions()).toHaveLength(1);
});

it('creates one action and one receipt under concurrent retries of the same key', async () => {
  const draft = await save();
  const key = idempotencyKey();
  const responses = await Promise.all([
    schedule(draft.id, { idempotencyKey: key }),
    schedule(draft.id, { idempotencyKey: key }),
  ]);
  expect(responses.some((response) => response.status === 201)).toBe(true);
  expect(responses.every((response) => response.status === 201 || response.status === 409)).toBe(
    true,
  );
  expect(await actions()).toHaveLength(1);
  expect(await receipts()).toHaveLength(1);
  const settled = await schedule(draft.id, { idempotencyKey: key });
  expect(settled.status).toBe(201);
  expect(settled.body.schedule.id).toBe((await actions())[0]!.id);
});

it.each(['archive', 'membership', 'role', 'version', 'elapsed', 'expiry'] as const)(
  'rechecks %s after creation waits on the Event lock',
  async (change) => {
    const draft = await save({ expiresAt: at(120_000).toISOString() });
    const key = idempotencyKey();
    await retry.reserve(key, {
      eventId,
      actorSub: author.sub,
      endpoint: 'announcement.schedule.create',
    });
    let release!: () => void;
    let acquired!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const hold = rawDb.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
        if (change === 'archive')
          await tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
        if (change === 'membership')
          await tx.eventMembership.update({
            where: { id: membershipId },
            data: { status: 'DEACTIVATED' },
          });
        if (change === 'role')
          await tx.eventMembership.update({ where: { id: membershipId }, data: { role: 'IC' } });
        if (change === 'version')
          await tx.announcementDraft.update({
            where: { id: draft.id },
            data: { version: { increment: 1 }, body: 'Changed while waiting' },
          });
        acquired();
        await waiting;
      },
      { timeout: 10_000 },
    );
    await locked;
    const entering = vi.spyOn(draftRepo, 'lockDraftEvent');
    const pending = createPublicationSchedule(
      {
        id: draft.id,
        request: ScheduleAnnouncementDraftRequest.parse({
          expectedVersion: 1,
          runAt: at(60_000).toISOString(),
          idempotencyKey: key,
        }),
      },
      {
        volunteerId: author.id,
        membershipId,
        scope: { eventId },
        audit: {
          eventId,
          membershipId,
          actorId: author.id,
          actorSub: author.sub,
          ip: null,
          userAgent: null,
          requestId: null,
        },
      },
    ).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
      if (change === 'elapsed') vi.setSystemTime(at(60_000));
      if (change === 'expiry') vi.setSystemTime(at(120_000));
    } finally {
      release();
    }
    await hold;
    expect(await pending).toMatchObject({
      code: change === 'membership' || change === 'role' ? 'FORBIDDEN' : 'CONFLICT',
    });
    expect(await actions()).toHaveLength(0);
    expect(await receipts()).toHaveLength(0);
    expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).statusCode).toBe(
      0,
    );
  },
);
