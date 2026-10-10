import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { MembershipStatus } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { applyLifecycleEffects } from '../../src/modules/event/application/applyLifecycleEffects.js';
import { lifecycleSnapshot } from '../../src/modules/event/application/lifecycleSnapshot.js';
import { recordLifecycleTransition } from '../../src/modules/event/application/recordLifecycleTransition.js';
import * as memberships from '../../src/modules/event/data/archiveMembershipRepo.js';
import * as reminders from '../../src/modules/event/data/archiveReminderRepo.js';
import { lockLifecycleEvent } from '../../src/modules/event/data/lifecycleRepo.js';
import { evaluateTransition } from '../../src/modules/event/domain/lifecycle.js';
import { requireCurrentPermission } from '../../src/platform/access/currentPermission.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import { ConflictError } from '../../src/platform/errors/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
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
const transactionDb = rawDb.$extends({ query: {} });
const AFTER_GRACE = new Date(FROZEN_NOW.getTime() + 24 * 3600_000 + 1);
let eventId: string;
let membershipId: string;
let admin: TestVolunteer;
let fixtureNumber = 0;
const state = () => rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
const memberRows = () =>
  rawDb.eventMembership.findMany({ where: { eventId }, orderBy: { id: 'asc' } });
const reminderRows = () =>
  rawDb.scheduledAction.findMany({ where: { eventId }, orderBy: { id: 'asc' } });
const finalRows = () => rawDb.reportSnapshot.findMany({ where: { eventId } });

/** Exercise the private effects under real locks/guards; HTTP ARCHIVED stays unsupported. */
async function archive(now = AFTER_GRACE) {
  return transactionDb.$transaction(
    async (tx) => {
      const scope = { eventId };
      const event = await lockLifecycleEvent(tx, scope);
      await requireCurrentPermission(tx, {
        scope,
        membershipId,
        personId: admin.id,
        action: 'Event.MarkReady',
      });
      const snapshot = await lifecycleSnapshot(tx, scope, { event, now });
      const decision = evaluateTransition(snapshot, 'ARCHIVED', { now });
      if (!decision.allowed) throw new ConflictError('CONFLICT', 'Archive guards failed');
      const audit = {
        ...SYSTEM_AUDIT_CONTEXT,
        eventId,
        actorId: admin.id,
        actorSub: admin.sub,
        membershipId,
      };
      const effects = await applyLifecycleEffects(tx, {
        actor: { scope, volunteerId: admin.id, membershipId, audit },
        event,
        decision,
        now,
      });
      await recordLifecycleTransition(tx, {
        scope,
        audit,
        before: event,
        after: effects.row,
        snapshot,
        decision,
        closedWindows: effects.closedWindows,
        archive: effects.archive,
      });
      return effects;
    },
    { isolationLevel: 'ReadCommitted' },
  );
}

beforeEach(async () => {
  vi.setSystemTime(FROZEN_NOW);
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({
    email: `admin-${fixtureNumber++}@archive-effects.test`,
    role: 'ADMIN',
  });
  membershipId = (
    await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId_personId: { eventId, personId: admin.id } },
    })
  ).id;
  expect(
    (
      await request(app)
        .post(`/api/v1/events/${eventId}/lifecycle`)
        .set('Authorization', bearer(admin))
        .send({
          to: 'CLOSED',
          expectedVersion: (await state()).lifecycleVersion,
          idempotencyKey: idempotencyKey(),
        })
    ).status,
  ).toBe(200);
});

it('atomically timestamps archive, ends all standing and cancels reminders without altering final evidence', async () => {
  for (const status of MembershipStatus.options) {
    const person = await createVolunteer({
      email: `${status}-${fixtureNumber++}@archive-effects.test`,
      role: 'VOLUNTEER',
    });
    await rawDb.eventMembership.updateMany({
      where: { eventId, personId: person.id },
      data: {
        status,
        portfolio: `Preserve ${status} portfolio`,
        deactivatedReason: `Prior ${status}`,
      },
    });
    await rawDb.person.update({ where: { id: person.id }, data: { phone: '+6599999999' } });
  }
  const beforeMembers = await memberRows();
  const beforeState = await state();
  const beforeFinal = await finalRows();
  const beforePeople = await rawDb.person.findMany({ orderBy: { id: 'asc' } });
  const effect = await archive();
  expect(effect.archive?.endedMemberships).toBe(
    beforeMembers.filter((row) => row.status !== 'ENDED').length,
  );
  const afterMembers = await memberRows();
  for (const before of beforeMembers) {
    const after = afterMembers.find((row) => row.id === before.id);
    expect(after).toMatchObject({ ...before, status: 'ENDED', updatedAt: expect.any(Date) });
    if (before.status === 'ENDED') expect(after).toEqual(before);
  }
  expect(await state()).toMatchObject({
    status: 'ARCHIVED',
    archivedAt: AFTER_GRACE,
    closedAt: beforeState.closedAt,
    lifecycleVersion: beforeState.lifecycleVersion + 1,
  });
  expect(await finalRows()).toEqual(beforeFinal);
  expect(await rawDb.person.findMany({ orderBy: { id: 'asc' } })).toEqual(beforePeople);
  expect(await reminderRows()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'event.archiveReminder',
        status: 'CANCELLED',
        completedAt: AFTER_GRACE,
      }),
    ]),
  );
  const rows = await rawDb.auditLog.findMany({
    where: { eventId, action: 'event.transition' },
    orderBy: { createdAt: 'asc' },
  });
  expect(rows).toHaveLength(2);
  expect(rows.some((row) => (row.after as { action: string }).action === 'Event.Archive')).toBe(
    true,
  );
  expect(
    rows.find((row) => (row.after as { action: string }).action === 'Event.Archive')?.after,
  ).toMatchObject({
    archivedAt: AFTER_GRACE.toISOString(),
    archive: effect.archive,
    guardResults: {
      archive: {
        lostPersonPurgeComplete: true,
        finalReportExists: true,
        captureGracePeriodComplete: true,
      },
    },
  });
});

it('publishes membership and phase invalidation inside the supplied transaction', async () => {
  const original = cacheBus.publishCacheEvent;
  const spy = vi.spyOn(cacheBus, 'publishCacheEvent').mockImplementation(original);
  try {
    await archive();
    expect(spy.mock.calls.map((call) => call[1])).toEqual(['membership', 'event.state']);
    expect(spy.mock.calls[0]?.[2]).toEqual({ eventId });
  } finally {
    spy.mockRestore();
  }
});

it.each([
  'membership ending',
  'reminder cancellation',
  'membership publication',
  'phase publication',
])('rolls back every archive effect when %s fails', async (failure) => {
  const before = {
    event: await state(),
    members: await memberRows(),
    reminders: await reminderRows(),
    final: await finalRows(),
  };
  const error = new Error('Archive rollback drill');
  const original = cacheBus.publishCacheEvent;
  const spy =
    failure === 'membership ending'
      ? vi.spyOn(memberships, 'endArchivedMemberships').mockRejectedValueOnce(error)
      : failure === 'reminder cancellation'
        ? vi.spyOn(reminders, 'cancelArchiveReminders').mockRejectedValueOnce(error)
        : vi.spyOn(cacheBus, 'publishCacheEvent').mockImplementation(async (...args) => {
            if (args[1] === (failure === 'membership publication' ? 'membership' : 'event.state'))
              throw error;
            return original(...args);
          });
  try {
    await expect(archive()).rejects.toThrow('Archive rollback drill');
  } finally {
    spy.mockRestore();
  }
  expect(await state()).toEqual(before.event);
  expect(await memberRows()).toEqual(before.members);
  expect(await reminderRows()).toEqual(before.reminders);
  expect(await finalRows()).toEqual(before.final);
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'event.transition' } })).toBe(1);
  expect((await archive()).row.status).toBe('ARCHIVED');
});

it('leaves another event and unrelated or terminal scheduled actions unchanged', async () => {
  const other = await createEvent({
    organisationId: (await state()).organisationId,
    slug: 'other-archive',
    name: 'Other archive',
    timezone: 'Europe/London',
    status: 'LIVE',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  const otherMember = await rawDb.eventMembership.create({
    data: { eventId: other.id, personId: admin.id, role: 'ADMIN', status: 'ACTIVE' },
  });
  const otherReminder = await rawDb.scheduledAction.create({
    data: { eventId: other.id, type: 'event.archiveReminder', payload: {}, runAt: FROZEN_NOW },
  });
  const unrelated = await rawDb.scheduledAction.create({
    data: { eventId, type: 'report.snapshot', payload: {}, runAt: FROZEN_NOW },
  });
  const terminal = await rawDb.scheduledAction.create({
    data: {
      eventId,
      type: 'event.archiveReminder',
      payload: {},
      runAt: FROZEN_NOW,
      status: 'SUCCEEDED',
      completedAt: FROZEN_NOW,
    },
  });
  const beforeOther = await rawDb.event.findUniqueOrThrow({ where: { id: other.id } });
  await archive();
  expect(await rawDb.event.findUniqueOrThrow({ where: { id: other.id } })).toEqual(beforeOther);
  expect(
    await rawDb.eventMembership.findUniqueOrThrow({
      where: { eventId: other.id, id: otherMember.id },
    }),
  ).toEqual(otherMember);
  expect(
    await rawDb.scheduledAction.findUniqueOrThrow({
      where: { eventId: other.id, id: otherReminder.id },
    }),
  ).toEqual(otherReminder);
  expect(await reminderRows()).toEqual(expect.arrayContaining([unrelated, terminal]));
});

it('does not start effects before grace or permit the public archive request yet', async () => {
  await expect(archive(new Date(AFTER_GRACE.getTime() - 1))).rejects.toThrow(
    'Archive guards failed',
  );
  const event = await state();
  expect(event.status).toBe('CLOSED');
  const response = await request(app)
    .post(`/api/v1/events/${eventId}/lifecycle`)
    .set('Authorization', bearer(admin))
    .send({
      to: 'ARCHIVED',
      expectedVersion: event.lifecycleVersion,
      idempotencyKey: idempotencyKey(),
    });
  expect(response.status).toBe(400);
  expect((await memberRows())[0]?.status).toBe('ACTIVE');
  expect((await state()).archivedAt).toBeNull();
});
