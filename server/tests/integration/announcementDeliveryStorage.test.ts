import { beforeEach, expect, it, vi } from 'vitest';
import type { AuditContext } from '../../src/platform/audit/index.js';
import * as audit from '../../src/platform/audit/index.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import type { EventScope } from '../../src/platform/db/eventScope.js';
import { prisma } from '../../src/platform/db/client.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { createEvent } from '../../src/modules/event/index.js';
import { queueAnnouncementDeliveries } from '../../src/modules/announcement/application/queueAnnouncementDeliveries.js';
import * as deliveryRepo from '../../src/modules/announcement/data/deliveryPlanRepo.js';
import * as notification from '../../src/modules/notification/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  createEventDayToday,
  createEventDayOn,
  createStation,
  createVolunteer,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let scope: EventScope;
let author: TestVolunteer;
let memberId: string;
let context: AuditContext;
let deviceSequence = 0;

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  scope = await testEvent();
  author = await createVolunteer({ email: 'delivery-author@test.example', role: 'ADMIN' });
  memberId = (
    await rawDb.eventMembership.findFirstOrThrow({
      where: { eventId: scope.eventId, personId: author.id },
    })
  ).id;
  context = {
    eventId: scope.eventId,
    actorId: author.id,
    actorSub: author.sub,
    membershipId: memberId,
    ip: null,
    userAgent: null,
    requestId: null,
  };
});

const source = (patch: Partial<Prisma.AnnouncementUncheckedCreateInput> = {}) =>
  rawDb.announcement.create({
    data: {
      eventId: scope.eventId,
      authorId: author.id,
      authorMembershipId: memberId,
      body: 'Operational message never copied into delivery storage',
      priority: 'URGENT',
      createdAt: FROZEN_NOW,
      ...patch,
    },
  });
const device = (personId = author.id) =>
  rawDb.pushSubscription.create({
    data: {
      volunteerId: personId,
      endpoint: `https://push.test/device-${deviceSequence++}`,
      p256dh: 'fixture-key',
      auth: 'fixture-auth',
      lastSeenAt: FROZEN_NOW,
    },
  });
const queue = (announcementId: string, now = FROZEN_NOW, event = scope) =>
  prisma.$transaction(
    (tx) =>
      queueAnnouncementDeliveries(event, {
        tx,
        announcementId,
        audit: { ...context, eventId: event.eventId },
        clock: fixedClock(now),
      }),
    { timeout: 10_000 },
  );
const receipts = () =>
  rawDb.auditLog.findMany({ where: { action: 'announcement.delivery.enqueue' } });

it('stores one attributed plan and device intents atomically without dispatch or copied secrets', async () => {
  const message = await source();
  const subscription = await device();
  const dispatch = vi.spyOn(notification, 'dispatch');
  const result = await queue(message.id);
  expect(result.created).toBe(true);
  expect(result.plan).toMatchObject({
    eventId: scope.eventId,
    announcementId: message.id,
    recipientCount: 1,
    deviceCount: 1,
    createdAt: FROZEN_NOW,
    expiresAt: new Date(FROZEN_NOW.getTime() + 1800_000),
  });
  const deliveries = await rawDb.announcementPushDelivery.findMany();
  expect(deliveries).toMatchObject([
    {
      planId: result.plan?.id,
      recipientPersonId: author.id,
      recipientMembershipId: memberId,
      subscriptionId: subscription.id,
      deviceKey: subscription.id,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 5,
      version: 0,
      lockedBy: null,
      lockedUntil: null,
      completedAt: null,
      lastError: null,
    },
  ]);
  const rows = await receipts();
  expect(rows).toMatchObject([
    {
      actorId: author.id,
      membershipId: memberId,
      actorSub: author.sub,
      entityId: result.plan?.id,
      source: 'USER',
    },
  ]);
  const stored = JSON.stringify([result.plan, deliveries, rows]);
  for (const forbidden of [
    message.body,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
  ]) {
    expect(stored).not.toContain(forbidden);
  }
  expect(dispatch).not.toHaveBeenCalled();
});

it('keeps INFO quiet with no plan, delivery or new receipt', async () => {
  const message = await source({ priority: 'INFO' });
  await device();
  expect(await queue(message.id)).toEqual({ plan: null, created: false });
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  expect(await receipts()).toHaveLength(0);
});

it('freezes a zero-device plan so later subscriptions cannot expand a retry', async () => {
  const message = await source();
  const original = await queue(message.id);
  expect(original.plan?.deviceCount).toBe(0);
  await device();
  expect(await queue(message.id)).toMatchObject({ plan: original.plan, created: false });
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  expect(await receipts()).toHaveLength(1);
});

it('deduplicates concurrent enqueuers and never adds a new recipient/device on retry', async () => {
  const message = await source();
  await device();
  const results = await Promise.all([queue(message.id), queue(message.id)]);
  expect(results.filter((result) => result.created)).toHaveLength(1);
  expect(results[0]?.plan?.id).toBe(results[1]?.plan?.id);
  const newcomer = await createVolunteer({
    email: 'delivery-newcomer@test.example',
    role: 'VOLUNTEER',
  });
  await device(newcomer.id);
  await device();
  const replay = await queue(message.id);
  expect(replay.created).toBe(false);
  expect(replay.plan?.deviceCount).toBe(1);
  expect(await rawDb.announcementPushDelivery.count()).toBe(1);
  expect(await receipts()).toHaveLength(1);
});

it('targets the exact intersection of role, station, day and active membership', async () => {
  const day = await createEventDayToday();
  const otherDay = await createEventDayOn('2027-01-08');
  const station = await createStation({ code: 'DELIVERY' });
  const cases = [
    ['matched', 'VOLUNTEER', day.id, true],
    ['wrong-role', 'IC', day.id, true],
    ['wrong-day', 'VOLUNTEER', otherDay.id, true],
    ['inactive', 'VOLUNTEER', day.id, false],
  ] as const;
  let expected: string | undefined;
  for (const [name, role, eventDayId, active] of cases) {
    const person = await createVolunteer({ email: `${name}@delivery.test`, role });
    await assignToStationAllBlocks({ volunteerId: person.id, stationId: station.id, eventDayId });
    await device(person.id);
    if (!active)
      await rawDb.eventMembership.updateMany({
        where: { eventId: scope.eventId, personId: person.id },
        data: { status: 'DEACTIVATED' },
      });
    if (name === 'matched') expected = person.id;
  }
  const message = await source({
    targetRole: 'VOLUNTEER',
    targetStationId: station.id,
    targetEventDayId: day.id,
  });
  const result = await queue(message.id);
  expect(result.plan).toMatchObject({ recipientCount: 1, deviceCount: 1 });
  expect(
    (await rawDb.announcementPushDelivery.findMany()).map((row) => row.recipientPersonId),
  ).toEqual([expected]);
});

it('caps the plan at an earlier explicit expiry and refuses its inclusive deadline', async () => {
  const expiry = new Date(FROZEN_NOW.getTime() + 60_000);
  const message = await source({ expiresAt: expiry });
  expect((await queue(message.id)).plan?.expiresAt).toEqual(expiry);
  const expired = await source({ expiresAt: FROZEN_NOW });
  await expect(queue(expired.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(1);
});

it('never extends the original push TTL for a late enqueue', async () => {
  const message = await source();
  await expect(queue(message.id, new Date(FROZEN_NOW.getTime() + 1800_000))).rejects.toMatchObject({
    code: 'CONFLICT',
  });
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
});

it('rolls plan, intents and audit back with the supplied publishing transaction', async () => {
  const message = await source();
  await device();
  await expect(
    prisma.$transaction(async (tx) => {
      await queueAnnouncementDeliveries(scope, { tx, announcementId: message.id, audit: context });
      throw new Error('Injected publishing failure');
    }),
  ).rejects.toThrow('Injected publishing failure');
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  expect(await receipts()).toHaveLength(0);
});

it('rolls back all intent storage when the atomic audit fails', async () => {
  const message = await source();
  await device();
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Injected audit failure'));
  await expect(queue(message.id)).rejects.toThrow('Injected audit failure');
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
});

it('shares a newly published source and its attributed scheduled receipt in one transaction', async () => {
  await device();
  const action = await rawDb.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'announcement.publish',
      payload: {},
      runAt: FROZEN_NOW,
      createdByPersonId: author.id,
    },
  });
  const plan = await prisma.$transaction(async (tx) => {
    const message = await tx.announcement.create({
      data: {
        eventId: scope.eventId,
        authorId: author.id,
        authorMembershipId: memberId,
        body: 'Scheduled source fixture',
        priority: 'URGENT',
        createdAt: FROZEN_NOW,
      },
    });
    return queueAnnouncementDeliveries(scope, {
      tx,
      announcementId: message.id,
      audit: { ...context, source: 'SCHEDULE', scheduledActionId: action.id },
    });
  });
  expect(plan.plan?.deviceCount).toBe(1);
  expect(await receipts()).toMatchObject([
    {
      source: 'SCHEDULE',
      scheduledActionId: action.id,
      actorId: author.id,
      membershipId: memberId,
    },
  ]);
  expect(await rawDb.announcement.count()).toBe(1);
});

it('rolls back a newly published source together with its plan, device intents and receipt', async () => {
  await device();
  await expect(
    prisma.$transaction(async (tx) => {
      const message = await tx.announcement.create({
        data: {
          eventId: scope.eventId,
          authorId: author.id,
          authorMembershipId: memberId,
          body: 'Rolled back publication fixture',
          priority: 'URGENT',
          createdAt: FROZEN_NOW,
        },
      });
      await queueAnnouncementDeliveries(scope, { tx, announcementId: message.id, audit: context });
      throw new Error('Publication transaction rollback');
    }),
  ).rejects.toThrow('Publication transaction rollback');
  expect(await rawDb.announcement.count()).toBe(0);
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  expect(await receipts()).toHaveLength(0);
});

it('uses only active memberships, including when nobody remains eligible', async () => {
  const message = await source();
  await device();
  await rawDb.eventMembership.update({ where: { id: memberId }, data: { status: 'DEACTIVATED' } });
  expect((await queue(message.id)).plan).toMatchObject({ recipientCount: 0, deviceCount: 0 });
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
});

it('keeps the dedup identity after unsubscribe and refuses reassignment of an intent', async () => {
  const message = await source();
  const subscription = await device();
  await queue(message.id);
  await rawDb.pushSubscription.delete({ where: { id: subscription.id } });
  const row = await rawDb.announcementPushDelivery.findFirstOrThrow();
  expect(row.subscriptionId).toBeNull();
  expect(row.deviceKey).toBe(subscription.id);
  const replacement = await device();
  await expect(
    rawDb.announcementPushDelivery.update({
      where: { id: row.id },
      data: { subscriptionId: replacement.id },
    }),
  ).rejects.toBeDefined();
  await expect(
    rawDb.announcementPushDelivery.update({
      where: { id: row.id },
      data: { deviceKey: replacement.id },
    }),
  ).rejects.toBeDefined();
  expect((await queue(message.id)).created).toBe(false);
  expect(await rawDb.announcementPushDelivery.count()).toBe(1);
});

it('database guards freeze the plan and source while permitting valid delivery state', async () => {
  const message = await source();
  await device();
  const { plan } = await queue(message.id);
  await expect(
    rawDb.announcementDeliveryPlan.update({ where: { id: plan!.id }, data: { deviceCount: 2 } }),
  ).rejects.toBeDefined();
  await expect(
    rawDb.announcement.update({
      where: { id: message.id },
      data: { body: 'Changed underneath delivery' },
    }),
  ).rejects.toBeDefined();
  const row = await rawDb.announcementPushDelivery.findFirstOrThrow();
  await expect(
    rawDb.announcementPushDelivery.update({ where: { id: row.id }, data: { status: 'RUNNING' } }),
  ).rejects.toBeDefined();
  const running = await rawDb.announcementPushDelivery.update({
    where: { id: row.id },
    data: {
      status: 'RUNNING',
      lockedBy: 'worker-test',
      lockedUntil: new Date(FROZEN_NOW.getTime() + 60_000),
      attempts: 1,
      version: 1,
    },
  });
  expect(running.status).toBe('RUNNING');
  const sent = await rawDb.announcementPushDelivery.update({
    where: { id: row.id },
    data: {
      status: 'SENT',
      completedAt: FROZEN_NOW,
      lockedBy: null,
      lockedUntil: null,
      version: 2,
    },
  });
  expect(sent.status).toBe('SENT');
  const silent = await source({ priority: 'INFO' });
  await expect(
    rawDb.announcement.update({
      where: { id: silent.id },
      data: { body: 'Existing unplanned row retains its behavior' },
    }),
  ).resolves.toBeDefined();
});

async function foreignEvent() {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
  return createEvent({
    organisationId: event.organisationId,
    slug: 'foreign-delivery',
    name: 'Foreign',
    timezone: event.timezone,
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
}

it('does not include foreign-only members or a device reassigned to one of them', async () => {
  const foreign = await foreignEvent();
  const outsider = await rawDb.person.create({
    data: {
      email: 'outsider@delivery.test',
      displayName: 'Foreign member',
      cognitoSub: 'local:foreign-delivery',
    },
  });
  await rawDb.eventMembership.create({
    data: { eventId: foreign.id, personId: outsider.id, role: 'ADMIN' },
  });
  await device(outsider.id);
  const transferred = await device();
  await rawDb.pushSubscription.update({
    where: { id: transferred.id },
    data: { volunteerId: outsider.id },
  });
  const message = await source();
  expect((await queue(message.id)).plan).toMatchObject({ recipientCount: 1, deviceCount: 0 });
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
});

it('database bounds refuse impossible attempts, state and arbitrary stored exception text', async () => {
  const message = await source();
  await device();
  await queue(message.id);
  const row = await rawDb.announcementPushDelivery.findFirstOrThrow();
  await expect(
    rawDb.announcementPushDelivery.update({ where: { id: row.id }, data: { attempts: 6 } }),
  ).rejects.toBeDefined();
  await expect(
    rawDb.announcementPushDelivery.update({ where: { id: row.id }, data: { status: 'SENT' } }),
  ).rejects.toBeDefined();
  await expect(
    rawDb.$executeRaw`UPDATE "AnnouncementPushDelivery" SET "lastError" = 'raw exception text' WHERE id = ${row.id}`,
  ).rejects.toBeDefined();
  expect(
    (await rawDb.announcementPushDelivery.findUniqueOrThrow({ where: { id: row.id } })).status,
  ).toBe('PENDING');
});

it('foreign and missing source ids are unavailable and database FKs enforce plan/member scope', async () => {
  const foreign = await foreignEvent();
  const foreignMember = await rawDb.eventMembership.create({
    data: { eventId: foreign.id, personId: author.id, role: 'ADMIN' },
  });
  const foreignMessage = await source({
    eventId: foreign.id,
    authorMembershipId: foreignMember.id,
  });
  await expect(queue(foreignMessage.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(queue('no-such-message')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    rawDb.announcementDeliveryPlan.create({
      data: {
        eventId: scope.eventId,
        announcementId: foreignMessage.id,
        recipientCount: 0,
        deviceCount: 0,
        createdAt: FROZEN_NOW,
        expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  const message = await source();
  await device();
  const { plan } = await queue(message.id);
  await expect(
    rawDb.announcementPushDelivery.create({
      data: {
        eventId: scope.eventId,
        planId: plan!.id,
        recipientPersonId: author.id,
        recipientMembershipId: foreignMember.id,
        deviceKey: 'constraint',
        runAt: FROZEN_NOW,
        createdAt: FROZEN_NOW,
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  await expect(
    rawDb.announcementPushDelivery.create({
      data: {
        eventId: foreign.id,
        planId: plan!.id,
        recipientPersonId: author.id,
        recipientMembershipId: foreignMember.id,
        deviceKey: 'constraint',
        runAt: FROZEN_NOW,
        createdAt: FROZEN_NOW,
      },
    }),
  ).rejects.toMatchObject({ code: 'P2003' });
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(1);
  expect(await rawDb.announcementPushDelivery.count()).toBe(1);
});

it('refuses archived writes and an audit context that names another event', async () => {
  const message = await source();
  await expect(
    prisma.$transaction((tx) =>
      queueAnnouncementDeliveries(scope, {
        tx,
        announcementId: message.id,
        audit: { ...context, eventId: 'other' },
      }),
    ),
  ).rejects.toThrow('Delivery audit scope mismatch');
  await rawDb.event.update({ where: { id: scope.eventId }, data: { status: 'ARCHIVED' } });
  await expect(queue(message.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
});

it('resolves the current timezone and post-wait clock across the event day boundary', async () => {
  await rawDb.event.update({ where: { id: scope.eventId }, data: { dayBoundaryMinutes: 720 } });
  const station = await createStation({ code: 'BOUNDARY' });
  const previous = await createEventDayOn('2027-01-06');
  const today = await createEventDayToday();
  const oldPerson = await createVolunteer({
    email: 'previous-day@delivery.test',
    role: 'VOLUNTEER',
  });
  const newPerson = await createVolunteer({ email: 'new-day@delivery.test', role: 'VOLUNTEER' });
  await assignToStationAllBlocks({
    volunteerId: oldPerson.id,
    stationId: station.id,
    eventDayId: previous.id,
  });
  await assignToStationAllBlocks({
    volunteerId: newPerson.id,
    stationId: station.id,
    eventDayId: today.id,
  });
  await device(oldPerson.id);
  await device(newPerson.id);
  const message = await source({
    targetRole: 'VOLUNTEER',
    targetStationId: station.id,
    expiresAt: new Date(FROZEN_NOW.getTime() + 20 * 60_000),
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
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
      await tx.event.update({
        where: { id: scope.eventId },
        data: { timezone: 'UTC', dayBoundaryMinutes: 225 },
      });
      acquired();
      await waiting;
    },
    { timeout: 10_000 },
  );
  await locked;
  const entering = vi.spyOn(deliveryRepo, 'lockDeliveryEvent');
  const response = prisma.$transaction(
    (tx) => queueAnnouncementDeliveries(scope, { tx, announcementId: message.id, audit: context }),
    { timeout: 10_000 },
  );
  try {
    await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 16 * 60_000));
  } finally {
    release();
  }
  await hold;
  expect((await response).plan).toMatchObject({ recipientCount: 1, deviceCount: 1 });
  expect(
    (await rawDb.announcementPushDelivery.findMany()).map((row) => row.recipientPersonId),
  ).toEqual([newPerson.id]);
});

it.each(['archive', 'membership', 'expiry'] as const)(
  'rechecks %s after the Event wait',
  async (change) => {
    const message = await source({ expiresAt: new Date(FROZEN_NOW.getTime() + 60_000) });
    await device();
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
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
        if (change === 'archive')
          await tx.event.update({ where: { id: scope.eventId }, data: { status: 'ARCHIVED' } });
        if (change === 'membership')
          await tx.eventMembership.update({
            where: { id: memberId },
            data: { status: 'DEACTIVATED' },
          });
        acquired();
        await waiting;
      },
      { timeout: 10_000 },
    );
    await locked;
    const entering = vi.spyOn(deliveryRepo, 'lockDeliveryEvent');
    const response = prisma
      .$transaction(
        (tx) =>
          queueAnnouncementDeliveries(scope, { tx, announcementId: message.id, audit: context }),
        { timeout: 10_000 },
      )
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
    try {
      await vi.waitFor(() => expect(entering).toHaveBeenCalled(), { timeout: 3000 });
      if (change === 'expiry') vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 60_000));
    } finally {
      release();
    }
    await hold;
    if (change === 'membership') {
      expect(await response).toMatchObject({
        result: { plan: { recipientCount: 0, deviceCount: 0 } },
      });
    } else {
      expect(await response).toMatchObject({ error: { code: 'CONFLICT' } });
      expect(await rawDb.announcementDeliveryPlan.count()).toBe(0);
    }
    expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  },
);
