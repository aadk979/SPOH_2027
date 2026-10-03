import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  UpdateAnnouncementPublicationScheduleRequest,
  CancelAnnouncementPublicationScheduleRequest,
} from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { announcementScheduledHandlers } from '../../src/modules/announcement/index.js';
import { updatePublicationSchedule } from '../../src/modules/announcement/application/updatePublicationSchedule.js';
import { cancelPublicationSchedule } from '../../src/modules/announcement/application/cancelPublicationSchedule.js';
import * as scheduleRepo from '../../src/modules/announcement/data/publicationScheduleRepo.js';
import * as draftRepo from '../../src/modules/announcement/data/draftRepo.js';
import * as audit from '../../src/platform/audit/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const at = (offset: number) => new Date(FROZEN_NOW.getTime() + offset);
const content = {
  body: 'Synthetic schedule management content',
  priority: 'INFO',
  requiresAck: false,
  target: {},
};
let eventId: string;
let author: TestVolunteer;
let membershipId: string;
let draftId: string;
let scheduleId: string;
let retryKey: string;
const base = () => `/api/v1/events/${eventId}/announcements`;
const path = () => `${base()}/drafts/${draftId}/schedules`;
const save = async () => {
  const response = await request(app)
    .post(`${base()}/drafts`)
    .set('Authorization', bearer(author))
    .send({ ...content, idempotencyKey: idempotencyKey() });
  expect(response.status).toBe(201);
  return response.body.draft.id as string;
};
const create = (id = draftId, key = idempotencyKey()) =>
  request(app)
    .post(`${base()}/drafts/${id}/schedules`)
    .set('Authorization', bearer(author))
    .send({ expectedVersion: 1, runAt: at(60_000).toISOString(), idempotencyKey: key });
const edit = (patch = {}, actor = author) =>
  request(app)
    .put(`${path()}/${scheduleId}`)
    .set('Authorization', bearer(actor))
    .send({
      expectedVersion: 1,
      expectedDraftVersion: 1,
      runAt: at(120_000).toISOString(),
      ...patch,
    });
const cancel = (patch = {}, actor = author) =>
  request(app)
    .post(`${path()}/${scheduleId}/cancel`)
    .set('Authorization', bearer(actor))
    .send({ expectedVersion: 1, ...patch });
const list = (query = '', actor = author) =>
  request(app).get(`${path()}${query}`).set('Authorization', bearer(actor));
const row = () => rawDb.scheduledAction.findUniqueOrThrow({ where: { id: scheduleId } });
const receipts = () =>
  rawDb.auditLog.findMany({
    where: { entityId: scheduleId, action: { in: ['schedule.update', 'schedule.cancel'] } },
  });
const tick = async (instant: Date) => {
  const worker = await startScheduledJobs(fixedClock(instant));
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
};
const actor = () => ({
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
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  author = await createVolunteer({ email: 'schedule-management@test.example', role: 'ADMIN' });
  membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: author.id } })
  ).id;
  draftId = await save();
  retryKey = idempotencyKey();
  const response = await create(draftId, retryKey);
  expect(response.status).toBe(201);
  scheduleId = response.body.schedule.id;
});

it('lists only one owned draft with bounded stable pagination and private cursor validation', async () => {
  const second = (await create()).body.schedule.id;
  const firstPage = await list('?limit=1');
  expect(firstPage.status).toBe(200);
  expect(firstPage.headers['cache-control']).toBe('no-store');
  expect(firstPage.body.data).toHaveLength(1);
  const secondPage = await list(`?limit=1&cursor=${firstPage.body.meta.nextCursor}`);
  expect(secondPage.body.data).toHaveLength(1);
  expect(
    new Set([...firstPage.body.data, ...secondPage.body.data].map(({ id }: { id: string }) => id)),
  ).toEqual(new Set([scheduleId, second]));
  expect(secondPage.body.meta.nextCursor).toBeNull();
  const otherDraft = await save();
  const otherAction = (await create(otherDraft)).body.schedule.id;
  expect((await list(`?cursor=${otherAction}`)).status).toBe(404);
  expect((await list('?extra=untrusted')).status).toBe(400);
  expect((await list()).body.data).toHaveLength(2);
});

it('edits both due instants and the explicitly reviewed new draft version, then publishes only at the new time', async () => {
  const draftEdit = await request(app)
    .put(`${base()}/drafts/${draftId}`)
    .set('Authorization', bearer(author))
    .send({ ...content, body: 'Corrected saved version', expectedVersion: 1 });
  expect(draftEdit.status).toBe(200);
  expect((await edit()).status).toBe(409);
  const response = await edit({ expectedDraftVersion: 2, reason: 'Move publication later' });
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.schedule).toMatchObject({
    version: 2,
    draftVersion: 2,
    runAt: at(120_000).toISOString(),
    scheduledFor: at(120_000).toISOString(),
  });
  expect(await row()).toMatchObject({ attempts: 0, payload: { draftId, expectedVersion: 2 } });
  expect(await receipts()).toMatchObject([
    {
      action: 'schedule.update',
      source: 'USER',
      scheduledActionId: null,
      actorId: author.id,
      actorSub: author.sub,
      membershipId,
      eventId,
      before: { version: 1, draftVersion: 1 },
      after: { version: 2, draftVersion: 2, reason: 'Move publication later' },
    },
  ]);
  expect(JSON.stringify(await receipts())).not.toContain('Corrected saved version');
  expect((await create(draftId, retryKey)).body.schedule).toEqual(response.body.schedule);
  await tick(at(60_000));
  expect(await rawDb.announcement.count()).toBe(0);
  await tick(at(120_000));
  expect(await row()).toMatchObject({ status: 'SUCCEEDED', version: 4, completedAt: at(120_000) });
  expect(await rawDb.announcement.findFirstOrThrow()).toMatchObject({
    body: 'Corrected saved version',
    createdAt: at(120_000),
  });
});

it('an unchanged edit rechecks policy without fabricating a version or audit', async () => {
  const original = await row();
  expect((await edit({ runAt: at(60_000).toISOString() })).status).toBe(200);
  expect(await row()).toEqual(original);
  expect(await receipts()).toHaveLength(0);
});

it('cancels atomically, exposes current cancelled status and never publishes at the due time', async () => {
  const response = await cancel({ reason: 'Synthetic cancellation' });
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.schedule).toMatchObject({
    status: 'CANCELLED',
    version: 2,
    completedAt: FROZEN_NOW.toISOString(),
  });
  expect(await receipts()).toMatchObject([
    {
      action: 'schedule.cancel',
      source: 'USER',
      scheduledActionId: null,
      before: { status: 'PENDING', version: 1 },
      after: { status: 'CANCELLED', version: 2, reason: 'Synthetic cancellation' },
    },
  ]);
  expect((await create(draftId, retryKey)).body.schedule).toEqual(response.body.schedule);
  await tick(at(60_000));
  expect(await rawDb.announcement.count()).toBe(0);
  expect(await rawDb.announcementPublication.count()).toBe(0);
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
});

it('keeps list/edit/cancel private to the owner and exact draft path', async () => {
  const other = await createVolunteer({
    email: 'schedule-management-other@test.example',
    role: 'ADMIN',
  });
  expect((await list('', other)).status).toBe(404);
  expect((await edit({}, other)).status).toBe(404);
  expect((await cancel({}, other)).status).toBe(404);
  const ownOtherDraft = await save();
  expect(
    (
      await request(app)
        .put(`${base()}/drafts/${ownOtherDraft}/schedules/${scheduleId}`)
        .set('Authorization', bearer(author))
        .send({ expectedVersion: 1, expectedDraftVersion: 1, runAt: at(120_000).toISOString() })
    ).status,
  ).toBe(404);
  expect((await row()).version).toBe(1);
});

it('requires authenticated announcement capability on all three routes', async () => {
  const volunteer = await createVolunteer({
    email: 'schedule-management-volunteer@test.example',
    role: 'VOLUNTEER',
  });
  expect((await request(app).get(path())).status).toBe(401);
  expect((await request(app).put(`${path()}/${scheduleId}`).send({})).status).toBe(401);
  expect((await request(app).post(`${path()}/${scheduleId}/cancel`).send({})).status).toBe(401);
  expect((await list('', volunteer)).status).toBe(403);
  expect((await edit({}, volunteer)).status).toBe(403);
  expect((await cancel({}, volunteer)).status).toBe(403);
});

it('refuses both stale action versions, but permits only one concurrent mutation', async () => {
  const responses = await Promise.all([edit(), cancel()]);
  expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
  expect((await row()).version).toBe(2);
  expect(await receipts()).toHaveLength(1);
  expect((await edit()).status).toBe(409);
  expect((await cancel()).status).toBe(409);
});

it.each(['RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
  'refuses edit/cancel of %s actions',
  async (status) => {
    if (status === 'RUNNING') {
      await claimDueActions({
        workerId: 'management-claim',
        types: new HandlerRegistry(announcementScheduledHandlers).types(),
        clock: fixedClock(at(60_000)),
      });
    } else {
      await rawDb.scheduledAction.update({
        where: { id: scheduleId },
        data: { status, completedAt: FROZEN_NOW },
      });
    }
    const expectedVersion = (await row()).version;
    expect((await edit({ expectedVersion })).status).toBe(409);
    expect((await cancel({ expectedVersion })).status).toBe(409);
    expect(await receipts()).toHaveLength(0);
  },
);

it.each([0, -1, 180_000])('refuses past or inclusive expiry edit time %s', async (offset) => {
  await request(app)
    .put(`${base()}/drafts/${draftId}`)
    .set('Authorization', bearer(author))
    .send({ ...content, expectedVersion: 1, expiresAt: at(180_000).toISOString() });
  expect((await edit({ expectedDraftVersion: 2, runAt: at(offset).toISOString() })).status).toBe(
    409,
  );
  expect((await row()).version).toBe(1);
});

it.each(['edit', 'cancel'] as const)(
  '%s audit failure rolls back the action and permits retry',
  async (operation) => {
    const original = await row();
    vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Management audit unavailable'));
    expect((await (operation === 'edit' ? edit() : cancel())).status).toBe(500);
    expect(await row()).toEqual(original);
    expect(await receipts()).toHaveLength(0);
    expect((await (operation === 'edit' ? edit() : cancel())).status).toBe(200);
  },
);

it.each([
  { body: 'Injected text' },
  { expectedVersion: 0 },
  { expectedDraftVersion: 0 },
  { recurrence: 60 },
  { runAt: 'not-time' },
])('refuses malformed/injected edit %j', async (patch) => {
  expect((await edit(patch)).status).toBe(400);
  expect((await row()).version).toBe(1);
});

it.each([{ status: 'SUCCEEDED' }, { expectedVersion: 0 }, { reason: 'x'.repeat(501) }])(
  'refuses malformed/injected cancellation %j',
  async (patch) => {
    expect((await cancel(patch)).status).toBe(400);
    expect((await row()).status).toBe('PENDING');
  },
);

it('allows cancelling an expired pending draft without permitting its publication edit', async () => {
  await request(app)
    .put(`${base()}/drafts/${draftId}`)
    .set('Authorization', bearer(author))
    .send({ ...content, expectedVersion: 1, expiresAt: at(120_000).toISOString() });
  vi.setSystemTime(at(120_000));
  expect((await edit({ expectedDraftVersion: 2, runAt: at(180_000).toISOString() })).status).toBe(
    409,
  );
  expect((await cancel()).status).toBe(200);
});

it('refuses editing another pending action after its draft was published, but permits cancellation', async () => {
  const second = (await create()).body.schedule.id;
  await rawDb.scheduledAction.update({
    where: { id: scheduleId },
    data: { runAt: at(120_000), scheduledFor: at(120_000) },
  });
  await tick(at(60_000));
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: second } })).toMatchObject({
    status: 'SUCCEEDED',
  });
  expect((await row()).status).toBe('PENDING');
  expect((await edit({ runAt: at(180_000).toISOString() })).status).toBe(409);
  expect((await cancel()).status).toBe(200);
  expect(await rawDb.announcement.count()).toBe(1);
});

it.each(['recurrence', 'dedupeKey'] as const)(
  'refuses managing a user-unavailable %s action',
  async (field) => {
    await rawDb.scheduledAction.update({
      where: { id: scheduleId },
      data:
        field === 'recurrence' ? { recurrence: 60 } : { dedupeKey: 'synthetic-system-occurrence' },
    });
    expect((await edit()).status).toBe(404);
    expect((await cancel()).status).toBe(404);
    expect(await receipts()).toHaveLength(0);
  },
);

it.each(['edit', 'cancel'] as const)('%s remains read-only after archive', async (operation) => {
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect((await (operation === 'edit' ? edit() : cancel())).status).toBe(409);
  expect((await list()).status).toBe(200);
  expect((await row()).version).toBe(1);
});

it.each(['archive', 'membership', 'version', 'claimed', 'elapsed'] as const)(
  'edit observes %s committed while waiting on Event',
  async (change) => {
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
        if (change === 'version')
          await tx.scheduledAction.update({
            where: { id: scheduleId },
            data: { version: { increment: 1 } },
          });
        if (change === 'claimed')
          await tx.scheduledAction.update({
            where: { id: scheduleId },
            data: {
              status: 'RUNNING',
              attempts: 1,
              lockedBy: 'concurrent-worker',
              lockedUntil: at(300_000),
              version: { increment: 1 },
            },
          });
        acquired();
        await waiting;
      },
      { timeout: 10_000 },
    );
    await locked;
    const entering = vi.spyOn(draftRepo, 'lockDraftEvent');
    const pending = updatePublicationSchedule(
      {
        id: draftId,
        scheduleId,
        request: UpdateAnnouncementPublicationScheduleRequest.parse({
          expectedVersion: 1,
          expectedDraftVersion: 1,
          runAt: at(120_000).toISOString(),
        }),
      },
      actor(),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
      if (change === 'elapsed') vi.setSystemTime(at(120_000));
    } finally {
      release();
    }
    await hold;
    expect(await pending).toMatchObject({
      code: change === 'membership' ? 'FORBIDDEN' : 'CONFLICT',
    });
    expect(await receipts()).toHaveLength(0);
    expect((await row()).runAt).toEqual(at(60_000));
  },
);

it('cancellation waits for the action lock and samples completion time afterwards', async () => {
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
      await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE id = ${scheduleId} FOR UPDATE`;
      acquired();
      await waiting;
    },
    { timeout: 10_000 },
  );
  await locked;
  const entering = vi.spyOn(scheduleRepo, 'lockOwnPublicationSchedule');
  const pending = cancelPublicationSchedule(
    {
      id: draftId,
      scheduleId,
      request: CancelAnnouncementPublicationScheduleRequest.parse({ expectedVersion: 1 }),
    },
    actor(),
  );
  try {
    await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
    vi.setSystemTime(at(90_000));
  } finally {
    release();
  }
  await hold;
  expect(await pending).toMatchObject({
    status: 'CANCELLED',
    completedAt: at(90_000).toISOString(),
  });
  expect(await receipts()).toHaveLength(1);
});
