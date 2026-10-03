import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import type {
  Announcement,
  AnnouncementDeliveryPlan,
  Prisma,
  PushSubscription,
} from '../../src/generated/prisma/client.js';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { queueAnnouncementDeliveries } from '../../src/modules/announcement/application/queueAnnouncementDeliveries.js';
import { executeClaimedDelivery } from '../../src/modules/announcement/application/executeClaimedDelivery.js';
import { prepareClaimedDelivery } from '../../src/modules/announcement/application/prepareClaimedDelivery.js';
import { recordDeliveryOutcome } from '../../src/modules/announcement/application/recordDeliveryOutcome.js';
import { claimDueDeliveries } from '../../src/modules/announcement/application/claimDueDeliveries.js';
import type { ClaimedDelivery } from '../../src/modules/announcement/data/deliveryClaimRepo.js';
import * as deliveryRepo from '../../src/modules/announcement/data/deliveryExecutionRepo.js';
import * as webPush from '../../src/modules/notification/application/webPush.js';
import type { DevicePushInput, DevicePushResult } from '../../src/modules/notification/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
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

const now = FROZEN_NOW;
const at = (offset: number) => new Date(now.getTime() + offset);
let eventId: string;
let creator: TestVolunteer;
let recipient: TestVolunteer;
let recipientMemberId: string;
let subscription: PushSubscription;
let source: Announcement;
let plan: AnnouncementDeliveryPlan;
let deliveryId: string;
let sequence = 0;
const sender = (result: DevicePushResult = 'ACCEPTED') =>
  vi.fn<(input: DevicePushInput) => Promise<DevicePushResult>>().mockResolvedValue(result);
const claims = (instant = now, workerId = 'device-worker') =>
  claimDueDeliveries({ workerId, clock: fixedClock(instant) });
const claim = async (instant = now) => (await claims(instant))[0]!;
const row = () => rawDb.announcementPushDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
const execute = (token: ClaimedDelivery, send = sender(), instant = now) =>
  executeClaimedDelivery({ claim: token, send, clock: fixedClock(instant) });
const device = (personId: string) =>
  rawDb.pushSubscription.create({
    data: {
      volunteerId: personId,
      endpoint: `https://push.test/durable-${sequence++}`,
      p256dh: 'fixture-key',
      auth: 'fixture-auth',
      lastSeenAt: now,
    },
  });

async function arrangeSource(patch: Partial<Prisma.AnnouncementUncheckedCreateInput> = {}) {
  if (source) await rawDb.announcement.deleteMany({ where: { id: source.id } });
  source = await rawDb.announcement.create({
    data: {
      eventId,
      authorId: creator.id,
      authorMembershipId: (
        await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: creator.id } })
      ).id,
      body: 'Original operational message',
      priority: 'URGENT',
      targetRole: 'VOLUNTEER',
      createdAt: now,
      ...patch,
    },
  });
  const queued = await prisma.$transaction((tx) =>
    queueAnnouncementDeliveries(
      { eventId },
      {
        tx,
        announcementId: source.id,
        clock: fixedClock(now),
        audit: { ...SYSTEM_AUDIT_CONTEXT, eventId, actorId: creator.id, actorSub: creator.sub },
      },
    ),
  );
  plan = queued.plan!;
  deliveryId = (
    await rawDb.announcementPushDelivery.findFirstOrThrow({
      where: { planId: plan.id, recipientPersonId: recipient.id },
    })
  ).id;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(now);
  await resetDatabase();
  ({ eventId } = await testEvent());
  creator = await createVolunteer({ email: 'worker-author@test.example', role: 'ADMIN' });
  recipient = await createVolunteer({ email: 'worker-recipient@test.example', role: 'VOLUNTEER' });
  recipientMemberId = (
    await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: recipient.id } })
  ).id;
  subscription = await device(recipient.id);
  await arrangeSource();
});

it('commits a send reservation, performs network I/O outside transactions, then records service acceptance only', async () => {
  const token = await claim();
  const send = sender().mockImplementation(async () => {
    expect(await row()).toMatchObject({
      status: 'RUNNING',
      attempts: 1,
      version: 2,
      completedAt: null,
    });
    // Both would block if the preflight Event/row locks survived into this port.
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    await rawDb.announcementPushDelivery.update({
      where: { id: deliveryId },
      data: { lastError: 'PUSH_FAILED' },
    });
    return 'ACCEPTED';
  });
  expect(await execute(token, send)).toBe('SENT');
  expect(await row()).toMatchObject({
    status: 'SENT',
    lastError: null,
    attempts: 1,
    version: 3,
    completedAt: now,
    lockedBy: null,
    lockedUntil: null,
  });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      target: {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      payload: expect.objectContaining({
        body: source.body,
        tag: `announcement:${source.id}`,
        url: expect.stringMatching(/^\/e\/[^/]+\/inbox$/),
        priority: 'URGENT',
      }),
      ttlSeconds: 1800,
    }),
  );
  expect(await claims(at(300_001))).toEqual([]);
  expect(JSON.stringify(await row())).not.toContain(source.body);
  expect(JSON.stringify(await row())).not.toContain(subscription.endpoint);
});

it('fences duplicate executors of the same token to one external attempt', async () => {
  const token = await claim();
  const send = sender();
  expect((await Promise.all([execute(token, send), execute(token, send)])).sort()).toEqual([
    'SENT',
    'STALE',
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  expect((await row()).attempts).toBe(1);
});

it('claims disjoint bounded batches across competing workers', async () => {
  for (let index = 0; index < 2; index++) {
    const person = await createVolunteer({
      email: `batch-${index}@worker.test`,
      role: 'VOLUNTEER',
    });
    for (let count = 0; count < 3; count++) await device(person.id);
  }
  await arrangeSource();
  const batches = await Promise.all([claims(now, 'instance-a'), claims(now, 'instance-b')]);
  expect(batches.every((batch) => batch.length <= 5)).toBe(true);
  expect(batches.flat()).toHaveLength(7);
  expect(new Set(batches.flat().map((entry) => entry.id)).size).toBe(7);
});

it('skips a row locked by another short claim without blocking', async () => {
  let release!: () => void;
  let acquired!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const hold = rawDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AnnouncementPushDelivery" WHERE id = ${deliveryId} FOR UPDATE`;
    acquired();
    await gate;
  });
  await locked;
  try {
    expect(await claims()).toEqual([]);
  } finally {
    release();
  }
  await hold;
  expect(await claims()).toHaveLength(1);
});

it('checks inclusive due and lease boundaries without early work', async () => {
  await rawDb.announcementPushDelivery.update({
    where: { id: deliveryId },
    data: { runAt: at(1) },
  });
  expect(await claims()).toEqual([]);
  const token = await claim(at(1));
  expect(await claims(token.lockedUntil)).toEqual([]);
  const reclaimed = await claim(new Date(token.lockedUntil.getTime() + 1));
  expect(reclaimed).toMatchObject({ attempts: 2, version: 2 });
  const send = sender();
  expect(await execute(token, send, at(300_002))).toBe('STALE');
  expect(send).not.toHaveBeenCalled();
});

it.each(['DEACTIVATED', 'ENDED'] as const)('skips a currently %s recipient', async (status) => {
  const token = await claim();
  await rawDb.eventMembership.update({ where: { id: recipientMemberId }, data: { status } });
  const send = sender();
  expect(await execute(token, send)).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'RECIPIENT_INACTIVE' });
  expect(send).not.toHaveBeenCalled();
});

it('skips a currently active recipient whose role no longer matches the frozen target', async () => {
  const token = await claim();
  await rawDb.eventMembership.update({ where: { id: recipientMemberId }, data: { role: 'IC' } });
  const send = sender();
  expect(await execute(token, send)).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'RECIPIENT_OUT_OF_SCOPE' });
  expect(send).not.toHaveBeenCalled();
});

it('checks current station/day intersection before sending', async () => {
  const station = await createStation({ code: 'WORKER' });
  const day = await createEventDayToday();
  await assignToStationAllBlocks({
    volunteerId: recipient.id,
    stationId: station.id,
    eventDayId: day.id,
  });
  await arrangeSource({ targetStationId: station.id, targetEventDayId: day.id });
  const token = await claim();
  await rawDb.shiftAssignment.deleteMany({ where: { eventId, volunteerId: recipient.id } });
  const send = sender();
  expect(await execute(token, send)).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'RECIPIENT_OUT_OF_SCOPE' });
  expect(send).not.toHaveBeenCalled();
});

it.each(['unsubscribed', 'reassigned', 'archived'])(
  'skips a device/event that is now %s',
  async (kind) => {
    const token = await claim();
    if (kind === 'unsubscribed')
      await rawDb.pushSubscription.delete({ where: { id: subscription.id } });
    if (kind === 'reassigned')
      await rawDb.pushSubscription.update({
        where: { id: subscription.id },
        data: { volunteerId: creator.id },
      });
    if (kind === 'archived')
      await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    const send = sender();
    expect(await execute(token, send)).toBe('SKIPPED');
    expect(await row()).toMatchObject({
      lastError:
        kind === 'unsubscribed'
          ? 'SUBSCRIPTION_GONE'
          : kind === 'reassigned'
            ? 'SUBSCRIPTION_REASSIGNED'
            : 'ARCHIVED',
    });
    expect(send).not.toHaveBeenCalled();
  },
);

it('uses current device keys without persisting a credential copy', async () => {
  await rawDb.pushSubscription.update({
    where: { id: subscription.id },
    data: { p256dh: 'rotated-key', auth: 'rotated-auth' },
  });
  const send = sender();
  expect(await execute(await claim(), send)).toBe('SENT');
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      target: expect.objectContaining({ keys: { p256dh: 'rotated-key', auth: 'rotated-auth' } }),
    }),
  );
  expect(JSON.stringify(await row())).not.toContain('rotated-key');
});

it('refuses an expired original lifetime at the inclusive deadline', async () => {
  await arrangeSource({ expiresAt: at(1) });
  const token = await claim();
  const send = sender();
  expect(await execute(token, send, at(1))).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'EXPIRED' });
  expect(send).not.toHaveBeenCalled();
});

it('stops an expiry reached after preflight and before external I/O', async () => {
  await arrangeSource({ expiresAt: at(1) });
  const token = await claim();
  const clock: Clock = { now: vi.fn().mockReturnValueOnce(now).mockReturnValue(at(1)) };
  const send = sender();
  expect(await executeClaimedDelivery({ claim: token, clock, send })).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'EXPIRED', version: 3 });
  expect(send).not.toHaveBeenCalled();
});

it('shrinks retry TTL from original publication and respects stored backoff', async () => {
  const send = sender('FAILED')
    .mockResolvedValueOnce('FAILED')
    .mockResolvedValueOnce('FAILED')
    .mockResolvedValueOnce('ACCEPTED');
  expect(await execute(await claim(), send)).toBe('PENDING');
  expect(await row()).toMatchObject({
    runAt: at(30_000),
    attempts: 1,
    lastError: 'PUSH_FAILED',
    completedAt: null,
  });
  expect(await claims(at(29_999))).toEqual([]);
  expect(await execute(await claim(at(30_000)), send, at(30_000))).toBe('PENDING');
  expect(await row()).toMatchObject({ runAt: at(150_000), attempts: 2 });
  expect(await execute(await claim(at(150_000)), send, at(150_000))).toBe('SENT');
  expect(send.mock.calls.map(([input]) => input.ttlSeconds)).toEqual([1800, 1770, 1650]);
  expect((await row()).attempts).toBe(3);
});

it('does not schedule a retry that reaches or exceeds the original deadline', async () => {
  await arrangeSource({ expiresAt: at(30_000) });
  expect(await execute(await claim(), sender('FAILED'))).toBe('SKIPPED');
  expect(await row()).toMatchObject({ lastError: 'EXPIRED', completedAt: now });
});

it('bounds thrown provider failures without storing raw credential/body text', async () => {
  const send = sender().mockRejectedValue(new Error('private endpoint and credential detail'));
  expect(await execute(await claim(), send)).toBe('PENDING');
  expect(await row()).toMatchObject({ lastError: 'PUSH_FAILED' });
  expect(JSON.stringify(await row())).not.toContain('private endpoint');
});

it('dead-letters a failed final attempt', async () => {
  await rawDb.announcementPushDelivery.update({ where: { id: deliveryId }, data: { attempts: 4 } });
  expect(await execute(await claim(), sender('FAILED'))).toBe('DEAD');
  expect(await row()).toMatchObject({ attempts: 5, lastError: 'PUSH_FAILED', completedAt: now });
});

it('reclaims an exhausted crashed lease without another external attempt', async () => {
  await rawDb.announcementPushDelivery.update({
    where: { id: deliveryId },
    data: { status: 'RUNNING', attempts: 5, lockedBy: 'crashed-final-worker', lockedUntil: at(-1) },
  });
  const token = await claim();
  const send = sender();
  expect(token.exhausted).toBe(true);
  expect(await execute(token, send)).toBe('DEAD');
  expect(await row()).toMatchObject({ lastError: 'RETRY_EXHAUSTED', attempts: 5 });
  expect(send).not.toHaveBeenCalled();
});

it('prunes a gone device only after its fenced outcome commits and retains dedup identity', async () => {
  expect(await execute(await claim(), sender('GONE'))).toBe('SKIPPED');
  expect(await row()).toMatchObject({
    lastError: 'SUBSCRIPTION_GONE',
    subscriptionId: null,
    deviceKey: subscription.id,
  });
  expect(await rawDb.pushSubscription.findUnique({ where: { id: subscription.id } })).toBeNull();
});

it.each(['owner', 'keys'])(
  'preserves a device whose %s changed while the provider request was in flight',
  async (kind) => {
    const send = sender().mockImplementation(async () => {
      await rawDb.pushSubscription.update({
        where: { id: subscription.id },
        data:
          kind === 'owner'
            ? { volunteerId: creator.id }
            : { p256dh: 'rotated-key', auth: 'rotated-auth' },
      });
      return 'GONE';
    });
    expect(await execute(await claim(), send)).toBe('SKIPPED');
    expect(
      await rawDb.pushSubscription.findUnique({ where: { id: subscription.id } }),
    ).not.toBeNull();
  },
);

it('does not deadlock concurrent unsubscribe against after-outcome pruning', async () => {
  let acquired!: () => void;
  let pruneStarted!: () => void;
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const pruning = new Promise<void>((resolve) => {
    pruneStarted = resolve;
  });
  const original = deliveryRepo.pruneUnchangedGoneDevice;
  const spy = vi.spyOn(deliveryRepo, 'pruneUnchangedGoneDevice').mockImplementation((device) => {
    pruneStarted();
    return original(device);
  });
  const hold = rawDb.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PushSubscription" WHERE id = ${subscription.id} FOR UPDATE`;
      acquired();
      await pruning;
      await tx.pushSubscription.delete({ where: { id: subscription.id } });
    },
    { timeout: 15_000 },
  );
  await locked;
  try {
    expect(await execute(await claim(), sender('GONE'))).toBe('SKIPPED');
    await hold;
  } finally {
    spy.mockRestore();
  }
  expect((await row()).subscriptionId).toBeNull();
});

it('retains the lease when outcome persistence fails after acceptance, then documents an at-least-once retry', async () => {
  const token = await claim();
  const send = sender();
  const spy = vi
    .spyOn(deliveryRepo, 'finishDelivery')
    .mockRejectedValueOnce(new Error('private outcome fault'));
  try {
    await expect(execute(token, send)).rejects.toThrow('private outcome fault');
  } finally {
    spy.mockRestore();
  }
  expect(await row()).toMatchObject({
    status: 'RUNNING',
    version: 2,
    attempts: 1,
    completedAt: null,
  });
  expect(await execute(await claim(at(300_001)), send, at(300_001))).toBe('SENT');
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]?.[0].payload.tag).toBe(send.mock.calls[1]?.[0].payload.tag);
});

it('rejects a stale reserved outcome without changing or pruning a newer claim', async () => {
  const old = await claim();
  const prepared = await prepareClaimedDelivery(old, fixedClock(now));
  expect(prepared.kind).toBe('SEND');
  if (prepared.kind !== 'SEND') throw new Error('Expected prepared send');
  const next = await claim(at(300_001));
  expect(await recordDeliveryOutcome(prepared.claim, fixedClock(at(300_001)), 'GONE')).toBe(
    'STALE',
  );
  expect(await row()).toMatchObject({
    status: 'RUNNING',
    version: next.version,
    lockedBy: next.lockedBy,
  });
  expect(
    await rawDb.pushSubscription.findUnique({ where: { id: subscription.id } }),
  ).not.toBeNull();
  expect(await execute(next, sender(), at(300_001))).toBe('SENT');
});

it('does not prune on a stale gone response after another worker reclaims during external I/O', async () => {
  let current = now;
  const clock: Clock = { now: () => current };
  let next!: ClaimedDelivery;
  const send = sender().mockImplementation(async () => {
    current = at(300_001);
    next = (await claimDueDeliveries({ workerId: 'new-device-worker', clock }))[0]!;
    return 'GONE';
  });
  expect(await executeClaimedDelivery({ claim: await claim(), clock, send })).toBe('STALE');
  expect(await row()).toMatchObject({
    status: 'RUNNING',
    version: next.version,
    lockedBy: next.lockedBy,
  });
  expect(
    await rawDb.pushSubscription.findUnique({ where: { id: subscription.id } }),
  ).not.toBeNull();
  expect(await execute(next, sender(), current)).toBe('SENT');
});

it('refuses a foreign event selector on an otherwise valid internal claim', async () => {
  const token = await claim();
  const send = sender();
  expect(await execute({ ...token, eventId: 'another-event' }, send)).toBe('STALE');
  expect(send).not.toHaveBeenCalled();
  expect(await row()).toMatchObject({ status: 'RUNNING', version: token.version });
});

it('rolls back a failed preflight reservation and makes no external call', async () => {
  const token = await claim();
  const original = deliveryRepo.reserveDeliverySend;
  const spy = vi
    .spyOn(deliveryRepo, 'reserveDeliverySend')
    .mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('private reservation fault');
    });
  const send = sender();
  try {
    await expect(execute(token, send)).rejects.toThrow('private reservation fault');
  } finally {
    spy.mockRestore();
  }
  expect(await row()).toMatchObject({ status: 'RUNNING', version: token.version, attempts: 1 });
  expect(send).not.toHaveBeenCalled();
  expect(await execute(token, send)).toBe('SENT');
});

async function whileEventLocked(
  work: (tx: Prisma.TransactionClient) => Promise<void>,
  token: ClaimedDelivery,
  instant: Date,
) {
  let acquired!: () => void;
  let release!: () => void;
  let started!: () => void;
  const locked = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  let current = now;
  const clock: Clock = { now: () => new Date(current.getTime()) };
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
  const original = deliveryRepo.lockClaimedDelivery;
  const spy = vi
    .spyOn(deliveryRepo, 'lockClaimedDelivery')
    .mockImplementationOnce(async (...args) => {
      started();
      return original(...args);
    });
  const send = sender();
  const pending = executeClaimedDelivery({ claim: token, clock, send });
  try {
    await entered;
    current = instant;
  } finally {
    release();
    spy.mockRestore();
  }
  await hold;
  return { result: await pending, send };
}

it.each(['archive', 'deactivate', 'expiry', 'lease'])(
  'rechecks %s after an Event-lock wait',
  async (kind) => {
    if (kind === 'expiry') await arrangeSource({ expiresAt: at(1) });
    const token = await claim();
    const { result, send } = await whileEventLocked(
      async (tx) => {
        if (kind === 'archive')
          await tx.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
        if (kind === 'deactivate')
          await tx.eventMembership.update({
            where: { id: recipientMemberId },
            data: { status: 'DEACTIVATED' },
          });
      },
      token,
      kind === 'lease' ? at(300_001) : at(1),
    );
    expect(result).toBe(kind === 'lease' ? 'STALE' : 'SKIPPED');
    expect(send).not.toHaveBeenCalled();
    if (kind !== 'lease')
      expect((await row()).lastError).toBe(
        kind === 'archive' ? 'ARCHIVED' : kind === 'deactivate' ? 'RECIPIENT_INACTIVE' : 'EXPIRED',
      );
  },
);

it('uses the current timezone and event day after waiting, without expanding the original audience', async () => {
  await rawDb.event.update({ where: { id: eventId }, data: { dayBoundaryMinutes: 720 } });
  const station = await createStation({ code: 'DAY-BOUNDARY' });
  const previous = await createEventDayOn('2027-01-06');
  await assignToStationAllBlocks({
    volunteerId: recipient.id,
    stationId: station.id,
    eventDayId: previous.id,
  });
  await arrangeSource({ targetStationId: station.id });
  const { result, send } = await whileEventLocked(
    async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: { timezone: 'UTC', dayBoundaryMinutes: 211 },
      });
    },
    await claim(),
    at(2 * 60_000),
  );
  expect(result).toBe('SKIPPED');
  expect((await row()).lastError).toBe('RECIPIENT_OUT_OF_SCOPE');
  expect(send).not.toHaveBeenCalled();
});

it('drains through the actual API scheduler composition with supported unconfigured push', async () => {
  const network = vi.spyOn(webPush, 'sendPush');
  const worker = await startScheduledJobs(fixedClock(now));
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
  expect(await row()).toMatchObject({ status: 'SKIPPED', lastError: 'UNCONFIGURED' });
  expect(network).not.toHaveBeenCalled();
});

it('publishes a saved version and drains its new intents in the same actual worker tick', async () => {
  await rawDb.announcement.delete({ where: { id: source.id } });
  const response = await request(createApp())
    .post(`/api/v1/events/${eventId}/announcements/drafts`)
    .set('Authorization', bearer(creator))
    .send({
      body: 'Scheduled through the worker composition',
      priority: 'URGENT',
      target: { role: 'VOLUNTEER' },
      idempotencyKey: idempotencyKey(),
    });
  expect(response.status).toBe(201);
  const action = await rawDb.scheduledAction.create({
    data: {
      eventId,
      createdByPersonId: creator.id,
      type: 'announcement.publish',
      payload: { draftId: response.body.draft.id, expectedVersion: 1 },
      runAt: now,
    },
  });
  const network = vi.spyOn(webPush, 'sendPush');
  const worker = await startScheduledJobs(fixedClock(now));
  try {
    await worker.tick();
  } finally {
    await worker.stop();
  }
  expect(await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).toMatchObject(
    { status: 'SUCCEEDED' },
  );
  const published = await rawDb.announcementPublication.findFirstOrThrow({ where: { eventId } });
  expect(published).toMatchObject({
    draftId: response.body.draft.id,
    scheduledActionId: action.id,
  });
  const deviceRow = await rawDb.announcementPushDelivery.findFirstOrThrow({ where: { eventId } });
  expect(deviceRow).toMatchObject({
    status: 'SKIPPED',
    lastError: 'UNCONFIGURED',
    recipientPersonId: recipient.id,
  });
  expect(
    await rawDb.announcementDeliveryPlan.findUniqueOrThrow({ where: { id: deviceRow.planId } }),
  ).toMatchObject({ announcementId: published.announcementId, deviceCount: 1, recipientCount: 1 });
  expect(network).not.toHaveBeenCalled();
});
