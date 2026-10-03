import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createApp } from '../../src/app/createApp.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { announcementScheduledHandlers } from '../../src/modules/announcement/index.js';
import * as delivery from '../../src/modules/announcement/application/queueAnnouncementDeliveries.js';
import * as publication from '../../src/modules/announcement/data/publicationRepo.js';
import * as sourceRepo from '../../src/modules/announcement/data/repo.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as notification from '../../src/modules/notification/index.js';
import * as audit from '../../src/platform/audit/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock, type Clock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayOn,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const registry = new HandlerRegistry(announcementScheduledHandlers);
const now = FROZEN_NOW;
const at = (offset: number) => new Date(now.getTime() + offset);
let eventId: string;
let creator: TestVolunteer;
let membershipId: string;
const content = {
  body: 'Saved operational content',
  priority: 'URGENT',
  requiresAck: true,
  target: {},
};
const base = () => `/api/v1/events/${eventId}/announcements`;
const save = async (patch = {}) => {
  const key = idempotencyKey();
  const body = { ...content, idempotencyKey: key, ...patch };
  const response = await request(app)
    .post(`${base()}/drafts`)
    .set('Authorization', bearer(creator))
    .send(body);
  expect(response.status).toBe(201);
  return { ...response.body.draft, retryBody: body };
};
const create = (draftId: string, patch: Partial<Prisma.ScheduledActionUncheckedCreateInput> = {}) =>
  rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'announcement.publish',
      payload: { draftId, expectedVersion: 1 },
      runAt: now,
      createdByPersonId: creator.id,
      ...patch,
    },
  });
const claims = (instant = now) =>
  claimDueActions({
    workerId: 'publication-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
const run = async (instant = now) =>
  runClaimedAction({ claim: (await claims(instant))[0]!, registry, clock: fixedClock(instant) });
const action = (id: string) => rawDb.scheduledAction.findUniqueOrThrow({ where: { id } });
const receipts = (id: string) => rawDb.auditLog.findMany({ where: { scheduledActionId: id } });
const effects = async () => ({
  sources: await rawDb.announcement.count(),
  publications: await rawDb.announcementPublication.count(),
  plans: await rawDb.announcementDeliveryPlan.count(),
  devices: await rawDb.announcementPushDelivery.count(),
  moduleAudits: await rawDb.auditLog.count({
    where: { action: { in: ['announcement.publish', 'announcement.delivery.enqueue'] } },
  }),
});
const noEffects = () =>
  expect(effects()).resolves.toEqual({
    sources: 0,
    publications: 0,
    plans: 0,
    devices: 0,
    moduleAudits: 0,
  });
const device = () =>
  rawDb.pushSubscription.create({
    data: {
      volunteerId: creator.id,
      endpoint: 'https://push.test/publication-device',
      p256dh: 'fixture-key',
      auth: 'fixture-auth',
      lastSeenAt: now,
    },
  });

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(now);
  await resetDatabase();
  ({ eventId } = await testEvent());
  creator = await createVolunteer({ email: 'scheduled-publication@test.example', role: 'ADMIN' });
  membershipId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: creator.id } })
  ).id;
});

it('atomically publishes the exact saved version, frozen plan and attributed scheduler outcome without network calls', async () => {
  const draft = await save({ expiresAt: at(900_000).toISOString() });
  const subscription = await device();
  const row = await create(draft.id);
  const dispatch = vi.spyOn(notification, 'dispatch');
  expect(await run()).toBe('SUCCEEDED');
  const source = await rawDb.announcement.findFirstOrThrow({ where: { eventId } });
  expect(source).toMatchObject({
    authorId: creator.id,
    authorMembershipId: membershipId,
    body: content.body,
    priority: 'URGENT',
    requiresAck: true,
    createdAt: now,
    expiresAt: at(900_000),
  });
  expect(
    await rawDb.announcementPublication.findFirstOrThrow({ where: { eventId } }),
  ).toMatchObject({
    draftId: draft.id,
    version: 1,
    announcementId: source.id,
    scheduledActionId: row.id,
    publishedAt: now,
  });
  expect(
    await rawDb.announcementDeliveryPlan.findFirstOrThrow({ where: { eventId } }),
  ).toMatchObject({
    announcementId: source.id,
    deviceCount: 1,
    recipientCount: 1,
    expiresAt: at(900_000),
  });
  expect(
    await rawDb.announcementPushDelivery.findFirstOrThrow({ where: { eventId } }),
  ).toMatchObject({
    subscriptionId: subscription.id,
    recipientMembershipId: membershipId,
    status: 'PENDING',
    attempts: 0,
  });
  const audits = await receipts(row.id);
  expect(audits.map((entry) => entry.action).sort()).toEqual([
    'announcement.delivery.enqueue',
    'announcement.publish',
    'schedule.execute',
  ]);
  expect(
    audits.every(
      (entry) =>
        entry.actorId === creator.id &&
        entry.actorSub === creator.sub &&
        entry.membershipId === membershipId &&
        entry.eventId === eventId &&
        entry.source === 'SCHEDULE',
    ),
  ).toBe(true);
  expect(JSON.stringify(audits)).not.toContain(content.body);
  expect(JSON.stringify(audits)).not.toContain(subscription.endpoint);
  expect(await action(row.id)).toMatchObject({
    status: 'SUCCEEDED',
    completedAt: now,
    lastError: null,
    lockedBy: null,
    lockedUntil: null,
  });
  expect(dispatch).not.toHaveBeenCalled();
  const inbox = await request(app).get(base()).set('Authorization', bearer(creator));
  expect(inbox.body.data.map((entry: { id: string }) => entry.id)).toEqual([source.id]);
});

it('publishes INFO quietly, without a delivery plan or device record', async () => {
  const draft = await save({ priority: 'INFO' });
  await device();
  const row = await create(draft.id);
  expect(await run()).toBe('SUCCEEDED');
  expect(await effects()).toEqual({
    sources: 1,
    publications: 1,
    plans: 0,
    devices: 0,
    moduleAudits: 1,
  });
  expect((await receipts(row.id)).map((entry) => entry.action).sort()).toEqual([
    'announcement.publish',
    'schedule.execute',
  ]);
});

it('makes a zero-device publication durable and never expands it on another action', async () => {
  const draft = await save();
  await create(draft.id);
  expect(await run()).toBe('SUCCEEDED');
  await device();
  await create(draft.id);
  expect(await run()).toBe('SUCCEEDED');
  expect(await effects()).toEqual({
    sources: 1,
    publications: 1,
    plans: 1,
    devices: 0,
    moduleAudits: 2,
  });
});

it('waits until the inclusive due boundary and stamps publication at execution time', async () => {
  const draft = await save();
  await create(draft.id, { runAt: at(60_000) });
  expect(await claims(at(59_999))).toEqual([]);
  await noEffects();
  expect(await run(at(60_000))).toBe('SUCCEEDED');
  expect(await rawDb.announcement.findFirstOrThrow({ where: { eventId } })).toMatchObject({
    createdAt: at(60_000),
  });
  expect(
    await rawDb.announcementDeliveryPlan.findFirstOrThrow({ where: { eventId } }),
  ).toMatchObject({ createdAt: at(60_000), expiresAt: at(60_000 + 1800_000) });
});

it('refuses a draft edited after scheduling, then permits a newly reviewed current version', async () => {
  const draft = await save();
  const row = await create(draft.id);
  expect(
    (
      await request(app)
        .put(`${base()}/drafts/${draft.id}`)
        .set('Authorization', bearer(creator))
        .send({ ...content, body: 'Reviewed new content', expectedVersion: 1 })
    ).status,
  ).toBe(200);
  expect(await run()).toBe('FAILED');
  expect(await action(row.id)).toMatchObject({ lastError: 'GUARD_FAILED' });
  await noEffects();
  await create(draft.id, { payload: { draftId: draft.id, expectedVersion: 2 } });
  expect(await run()).toBe('SUCCEEDED');
  expect(await rawDb.announcement.findFirstOrThrow({ where: { eventId } })).toMatchObject({
    body: 'Reviewed new content',
  });
  expect(
    await rawDb.announcementPublication.findFirstOrThrow({ where: { eventId } }),
  ).toMatchObject({ version: 2 });
});

it.each(['private owner', 'missing', 'foreign event'])(
  'refuses a %s draft with no publication',
  async (kind) => {
    const draft = await save();
    const other = await createVolunteer({ email: 'other-publisher@test.example', role: 'ADMIN' });
    let foreignId: string | undefined;
    if (kind === 'foreign event') {
      const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
      const foreign = await createEvent({
        organisationId: event.organisationId,
        slug: 'foreign-publication',
        name: 'Other event',
        timezone: event.timezone,
        status: 'LIVE',
        categories: [],
        stationTypes: [],
        shiftTemplates: [],
      });
      foreignId = foreign.id;
      await rawDb.eventMembership.create({
        data: { eventId: foreign.id, personId: creator.id, role: 'ADMIN', status: 'ACTIVE' },
      });
    }
    const row = await create(
      kind === 'missing' ? 'missing-draft' : draft.id,
      kind === 'private owner'
        ? { createdByPersonId: other.id }
        : foreignId
          ? { eventId: foreignId }
          : {},
    );
    expect(await run()).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({ lastError: 'TARGET_MISSING' });
    await noEffects();
  },
);

it.each(['body', 'eventId', 'authorId', 'announcementId', 'missing version', 'zero version'])(
  'refuses unsupported payload content: %s',
  async (key) => {
    const draft = await save();
    const payload =
      key === 'missing version'
        ? { draftId: draft.id }
        : key === 'zero version'
          ? { draftId: draft.id, expectedVersion: 0 }
          : { draftId: draft.id, expectedVersion: 1, [key]: 'untrusted' };
    const row = await create(draft.id, { payload });
    expect(await run()).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({ lastError: 'INVALID_PAYLOAD' });
    await noEffects();
  },
);

it.each(['system creator', 'platform action', 'recurrence'])(
  'refuses inappropriate provenance: %s',
  async (kind) => {
    const draft = await save();
    const row = await create(
      draft.id,
      kind === 'system creator'
        ? { createdByPersonId: null }
        : kind === 'platform action'
          ? { eventId: null }
          : { recurrence: 60, dedupeKey: 'user-publication-recurrence' },
    );
    expect(await run()).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({
      lastError: kind === 'recurrence' ? 'SYSTEM_ONLY' : 'AUTHORITY_CHANGED',
    });
    await noEffects();
  },
);

it.each(['DEACTIVATED', 'ENDED', 'demoted'] as const)(
  'rechecks current author authority: %s',
  async (kind) => {
    const draft = await save();
    const row = await create(draft.id);
    await rawDb.eventMembership.update({
      where: { id: membershipId },
      data: kind === 'demoted' ? { role: 'VOLUNTEER' } : { status: kind },
    });
    expect(await run()).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({ lastError: 'AUTHORITY_CHANGED' });
    expect((await receipts(row.id))[0]).toMatchObject({ outcome: 'DENIED' });
    await noEffects();
  },
);

it('checks current IC station authority rather than the permission when saved', async () => {
  const day = await createEventDayToday();
  const station = await createStation({ code: 'PUBLISH' });
  await assignToStationAllBlocks({
    volunteerId: creator.id,
    stationId: station.id,
    eventDayId: day.id,
  });
  const draft = await save({ target: { stationId: station.id } });
  const row = await create(draft.id);
  await rawDb.eventMembership.update({ where: { id: membershipId }, data: { role: 'IC' } });
  await rawDb.shiftAssignment.deleteMany({ where: { eventId, volunteerId: creator.id } });
  expect(await run()).toBe('FAILED');
  expect(await action(row.id)).toMatchObject({ lastError: 'AUTHORITY_CHANGED' });
  await noEffects();
});

it.each(['ARCHIVED', 'expiry'])('refuses current lifecycle/deadline: %s', async (kind) => {
  const draft = await save({ expiresAt: at(1).toISOString() });
  const row = await create(draft.id);
  if (kind === 'ARCHIVED')
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect(await run(kind === 'expiry' ? at(1) : now)).toBe('FAILED');
  expect(await action(row.id)).toMatchObject({
    lastError: kind === 'expiry' ? 'TOO_LATE' : 'GUARD_FAILED',
  });
  await noEffects();
});

it('serializes duplicate executors and separate actions for one saved version to one publication', async () => {
  const draft = await save();
  await device();
  const first = await create(draft.id);
  const second = await create(draft.id);
  const tokens = await claims();
  expect(tokens).toHaveLength(2);
  const firstToken = tokens.find((entry) => entry.id === first.id)!;
  expect(
    (
      await Promise.all([
        runClaimedAction({ claim: firstToken, registry, clock: fixedClock(now) }),
        runClaimedAction({ claim: firstToken, registry, clock: fixedClock(now) }),
        runClaimedAction({
          claim: tokens.find((entry) => entry.id === second.id)!,
          registry,
          clock: fixedClock(now),
        }),
      ])
    ).sort(),
  ).toEqual(['STALE', 'SUCCEEDED', 'SUCCEEDED']);
  expect(await effects()).toEqual({
    sources: 1,
    publications: 1,
    plans: 1,
    devices: 1,
    moduleAudits: 2,
  });
  expect(
    await rawDb.auditLog.count({ where: { action: 'schedule.execute', outcome: 'SUCCESS' } }),
  ).toBe(2);
});

it.each(['source', 'publication', 'delivery', 'module audit', 'completion', 'outcome audit'])(
  'rolls back every effect on %s failure, then retries once',
  async (stage) => {
    const draft = await save();
    await device();
    const row = await create(draft.id);
    const originalSource = sourceRepo.createAnnouncement;
    const originalDelivery = delivery.queueAnnouncementDeliveries;
    const originalAudit = audit.writeAudit;
    let failed = false;
    const spy =
      stage === 'source'
        ? vi.spyOn(sourceRepo, 'createAnnouncement').mockImplementationOnce(async (...args) => {
            await originalSource(...args);
            throw new Error('private fault');
          })
        : stage === 'publication'
          ? vi
              .spyOn(publication, 'recordPublication')
              .mockRejectedValueOnce(new Error('private fault'))
          : stage === 'delivery'
            ? vi
                .spyOn(delivery, 'queueAnnouncementDeliveries')
                .mockImplementationOnce(async (...args) => {
                  await originalDelivery(...args);
                  throw new Error('private fault');
                })
            : stage === 'completion'
              ? vi
                  .spyOn(executionRepo, 'finishAction')
                  .mockRejectedValueOnce(new Error('private fault'))
              : vi.spyOn(audit, 'writeAudit').mockImplementation(async (tx, input) => {
                  const result = await originalAudit(tx, input);
                  if (
                    !failed &&
                    input.action ===
                      (stage === 'module audit' ? 'announcement.publish' : 'schedule.execute')
                  ) {
                    failed = true;
                    throw new Error('private fault');
                  }
                  return result;
                });
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    await noEffects();
    const pending = await action(row.id);
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(JSON.stringify(await receipts(row.id))).not.toContain('private fault');
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await effects()).toEqual({
      sources: 1,
      publications: 1,
      plans: 1,
      devices: 1,
      moduleAudits: 2,
    });
  },
);

it('exposes publication on private reads/list/replay, refuses edits and protects all three database records', async () => {
  const draft = await save({ priority: 'INFO' });
  const row = await create(draft.id);
  expect(await run()).toBe('SUCCEEDED');
  const published = await rawDb.announcementPublication.findFirstOrThrow({ where: { eventId } });
  const read = await request(app)
    .get(`${base()}/drafts/${draft.id}`)
    .set('Authorization', bearer(creator));
  expect(read.body.draft).toMatchObject({
    version: 1,
    publishedAt: now.toISOString(),
    publishedAnnouncementId: published.announcementId,
  });
  const list = await request(app).get(`${base()}/drafts`).set('Authorization', bearer(creator));
  expect(list.body.data).toEqual([read.body.draft]);
  const replay = await request(app)
    .post(`${base()}/drafts`)
    .set('Authorization', bearer(creator))
    .send(draft.retryBody);
  expect(replay.status).toBe(201);
  expect(replay.body.draft).toEqual(read.body.draft);
  expect(
    (
      await request(app)
        .put(`${base()}/drafts/${draft.id}`)
        .set('Authorization', bearer(creator))
        .send({ ...content, expectedVersion: 1 })
    ).status,
  ).toBe(409);
  await expect(
    rawDb.announcementDraft.update({
      where: { id: draft.id },
      data: { body: 'Changed publication' },
    }),
  ).rejects.toThrow();
  await expect(
    rawDb.announcement.update({
      where: { id: published.announcementId },
      data: { body: 'Changed INFO source' },
    }),
  ).rejects.toThrow();
  await expect(
    rawDb.announcementPublication.update({
      where: { id: published.id },
      data: { publishedAt: at(1) },
    }),
  ).rejects.toThrow();
  await expect(rawDb.announcementDraft.delete({ where: { id: draft.id } })).rejects.toMatchObject({
    code: 'P2003',
  });
  await expect(
    rawDb.announcement.delete({ where: { id: published.announcementId } }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await rawDb.auditLog.deleteMany({ where: { scheduledActionId: row.id } });
  await expect(rawDb.scheduledAction.delete({ where: { id: row.id } })).rejects.toMatchObject({
    code: 'P2003',
  });
});

it('enforces event and saved-version FKs for draft, source and real scheduled action', async () => {
  const draft = await save();
  const source = await rawDb.announcement.create({
    data: {
      eventId,
      authorId: creator.id,
      authorMembershipId: membershipId,
      body: 'Fixture source',
    },
  });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const foreign = await createEvent({
    organisationId: event.organisationId,
    slug: 'foreign-provenance',
    name: 'Other event',
    timezone: event.timezone,
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const row = await create(draft.id);
  const foreignSource = await rawDb.announcement.create({
    data: { eventId: foreign.id, authorId: creator.id, body: 'Foreign source' },
  });
  const foreignAction = await create(draft.id, { eventId: foreign.id });
  const platformAction = await create(draft.id, { eventId: null });
  const data = {
    eventId,
    draftId: draft.id,
    version: 1,
    announcementId: source.id,
    scheduledActionId: row.id,
    publishedAt: now,
  };
  for (const patch of [
    { version: 2 },
    { eventId: foreign.id },
    { announcementId: foreignSource.id },
    { scheduledActionId: foreignAction.id },
    { scheduledActionId: platformAction.id },
  ]) {
    await expect(
      rawDb.announcementPublication.create({ data: { ...data, ...patch } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  }
  expect(await rawDb.announcementPublication.count()).toBe(0);
});

async function whileEventLocked(
  work: (tx: Prisma.TransactionClient) => Promise<void>,
  execute: (clock: Clock) => Promise<unknown>,
  instant = at(60_000),
) {
  let release!: () => void;
  let acquired!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let current = now;
  const hold = rawDb.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
      acquired();
      await gate;
      await work(tx);
    },
    { timeout: 15_000 },
  );
  await locked;
  const original = executionRepo.lockClaimedAction;
  const spy = vi
    .spyOn(executionRepo, 'lockClaimedAction')
    .mockImplementationOnce(async (...args) => {
      started();
      return original(...args);
    });
  const pending = execute({ now: () => new Date(current.getTime()) });
  try {
    await entered;
    current = instant;
  } finally {
    release();
    spy.mockRestore();
  }
  await hold;
  return pending;
}

it.each(['archive', 'deactivate', 'demote', 'expiry'])(
  'observes %s committed while waiting for Event, with a post-wait clock',
  async (kind) => {
    const draft = await save({ expiresAt: at(60_000).toISOString() });
    const row = await create(draft.id);
    const token = (await claims())[0]!;
    const result = await whileEventLocked(
      async (tx) => {
        if (kind === 'archive')
          await tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
        if (kind === 'deactivate' || kind === 'demote')
          await tx.eventMembership.update({
            where: { id: membershipId },
            data: kind === 'deactivate' ? { status: 'DEACTIVATED' } : { role: 'VOLUNTEER' },
          });
      },
      (clock) => runClaimedAction({ claim: token, registry, clock }),
    );
    expect(result).toBe('FAILED');
    expect(await action(row.id)).toMatchObject({
      lastError:
        kind === 'archive' ? 'GUARD_FAILED' : kind === 'expiry' ? 'TOO_LATE' : 'AUTHORITY_CHANGED',
    });
    await noEffects();
  },
);

it('uses current event timezone/day boundary and current IC postings after waiting', async () => {
  await rawDb.event.update({ where: { id: eventId }, data: { dayBoundaryMinutes: 720 } });
  const station = await createStation({ code: 'BOUNDARY' });
  const previous = await createEventDayOn('2027-01-06');
  const today = await createEventDayToday();
  await assignToStationAllBlocks({
    volunteerId: creator.id,
    stationId: station.id,
    eventDayId: previous.id,
  });
  const draft = await save({ target: { stationId: station.id } });
  await rawDb.eventMembership.update({ where: { id: membershipId }, data: { role: 'IC' } });
  const row = await create(draft.id);
  const token = (await claims())[0]!;
  expect(
    await whileEventLocked(
      async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: { timezone: 'UTC', dayBoundaryMinutes: 211 },
        });
      },
      (clock) => runClaimedAction({ claim: token, registry, clock }),
      at(2 * 60_000),
    ),
  ).toBe('FAILED');
  expect(await action(row.id)).toMatchObject({ lastError: 'AUTHORITY_CHANGED' });
  await noEffects();
  await assignToStationAllBlocks({
    volunteerId: creator.id,
    stationId: station.id,
    eventDayId: today.id,
  });
  await create(draft.id);
  expect(await run(at(2 * 60_000))).toBe('SUCCEEDED');
});

it('registers timed publication in the actual API worker composition', async () => {
  const draft = await save();
  const row = await create(draft.id);
  const worker = await startScheduledJobs(fixedClock(now));
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
  expect(await action(row.id)).toMatchObject({ status: 'SUCCEEDED' });
  expect(await rawDb.announcementPublication.count({ where: { eventId } })).toBe(1);
});
