import { randomUUID } from 'node:crypto';
import { FullReport } from '@spoh/shared';
import { beforeEach, expect, it, vi } from 'vitest';
import * as audit from '../../src/platform/audit/index.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import * as snapshotRepo from '../../src/modules/report/data/snapshotRepo.js';
import * as reminderRepo from '../../src/modules/event/data/archiveReminderRepo.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  lifecycleAt,
  lifecycleNow,
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';

let f: ScheduledLifecycleFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledLifecycleFixture();
  await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
});
const snapshots = () => rawDb.reportSnapshot.findMany({ where: { eventId: f.eventId } });
const reminders = () =>
  rawDb.scheduledAction.findMany({ where: { eventId: f.eventId, type: 'event.archiveReminder' } });
const close = async () => {
  await f.create({ to: 'CLOSED' });
  expect(await f.run()).toBe('SUCCEEDED');
};
const platformAdmin = () =>
  rawDb.organisationMembership.create({
    data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
  });
const heldItem = () =>
  rawDb.lostFoundItem.create({
    data: {
      eventId: f.eventId,
      itemLabel: 'Bottle',
      foundAt: lifecycleNow,
      loggedById: f.creator.id,
    },
  });

it('timed close commits every effect and live-only final report with worker completion once', async () => {
  const window = await f.window();
  const item = await heldItem();
  await rawDb.registration.createMany({
    data: [false, true].map((rehearsal) => ({
      eventId: f.eventId,
      stationId: f.stationId,
      categoryId: f.categoryId,
      rehearsal,
      recordedById: f.creator.id,
      recordedAt: lifecycleNow,
      idempotencyKey: randomUUID(),
    })),
  });
  const version = (await f.state()).lifecycleVersion;
  const row = await f.create({ to: 'CLOSED' });
  expect(await f.run()).toBe('SUCCEEDED');
  expect(await f.state()).toMatchObject({
    status: 'CLOSED',
    closedAt: lifecycleNow,
    lifecycleVersion: version + 1,
  });
  expect(
    (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt,
  ).toEqual(lifecycleNow);
  expect((await rawDb.lostFoundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
    'UNCLAIMED_AT_CLOSE',
  );
  const [snapshot] = await snapshots();
  expect(snapshot).toMatchObject({
    kind: 'FINAL',
    lifecycleVersion: version + 1,
    createdByPersonId: f.creator.id,
  });
  expect(FullReport.parse(snapshot!.report).registrations.total).toBe(1);
  expect(await reminders()).toEqual([
    expect.objectContaining({
      status: 'PENDING',
      runAt: lifecycleAt(24 * 3600_000),
      payload: { lifecycleVersion: version + 1 },
    }),
  ]);
  expect((await f.action(row.id)).status).toBe('SUCCEEDED');
  const receipts = await f.receipts(row.id);
  expect(receipts.map((entry) => entry.action).sort()).toEqual([
    'event.transition',
    'lostFound.closeOut',
    'schedule.execute',
  ]);
  expect(
    receipts.every((entry) => entry.source === 'SCHEDULE' && entry.actorId === f.creator.id),
  ).toBe(true);
  expect(await f.claims()).toEqual([]);
  expect(await snapshots()).toHaveLength(1);
});

it.each(['snapshot', 'reminder', 'module audit', 'publication', 'completion', 'outcome audit'])(
  'rolls back timed close and every effect on %s failure before one clean retry',
  async (stage) => {
    const window = await f.window();
    const item = await heldItem();
    const before = await f.state();
    const row = await f.create({ to: 'CLOSED' });
    const originalAudit = audit.writeAudit;
    const fault = new Error('private close fault');
    const spy =
      stage === 'snapshot'
        ? vi.spyOn(snapshotRepo, 'saveFinalSnapshot').mockRejectedValueOnce(fault)
        : stage === 'reminder'
          ? vi.spyOn(reminderRepo, 'enqueueArchiveReminder').mockRejectedValueOnce(fault)
          : stage === 'publication'
            ? vi.spyOn(cacheBus, 'publishCacheEvent').mockRejectedValueOnce(fault)
            : stage === 'completion'
              ? vi.spyOn(executionRepo, 'finishAction').mockRejectedValueOnce(fault)
              : vi.spyOn(audit, 'writeAudit').mockImplementation(async (tx, input) => {
                  if (
                    input.action ===
                    (stage === 'module audit' ? 'event.transition' : 'schedule.execute')
                  ) {
                    spy.mockRestore();
                    throw fault;
                  }
                  return originalAudit(tx, input);
                });
    try {
      expect(await f.run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await f.state()).toEqual(before);
    expect(
      (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt,
    ).toBeNull();
    expect((await rawDb.lostFoundItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe(
      'HELD',
    );
    expect(await snapshots()).toEqual([]);
    expect(await reminders()).toEqual([]);
    expect((await f.receipts(row.id)).map((entry) => entry.action)).toEqual(['schedule.execute']);
    expect(JSON.stringify(await f.receipts(row.id))).not.toContain('private close fault');
    const pending = await f.action(row.id);
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(await f.run(pending.runAt)).toBe('SUCCEEDED');
    expect(await snapshots()).toHaveLength(1);
    expect(await reminders()).toHaveLength(1);
    expect(
      (await rawDb.fallbackWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt,
    ).toEqual(pending.runAt);
  },
);

it('timed reopen preserves frozen content, supersedes it and cancels even a claimed reminder', async () => {
  await close();
  await platformAdmin();
  const beforeSnapshot = (await snapshots())[0]!;
  const beforeReminder = (await reminders())[0]!;
  await rawDb.scheduledAction.update({
    where: { id: beforeReminder.id },
    data: {
      status: 'RUNNING',
      lockedBy: 'waiting-reminder',
      lockedUntil: lifecycleAt(60_000),
      version: { increment: 1 },
    },
  });
  const row = await f.create({ to: 'LIVE', reason: 'Correct a mistaken timed close' });
  expect(await f.run()).toBe('SUCCEEDED');
  expect(await f.state()).toMatchObject({ status: 'LIVE', closedAt: null });
  expect(await snapshots()).toEqual([{ ...beforeSnapshot, supersededAt: lifecycleNow }]);
  expect((await reminders())[0]).toMatchObject({
    status: 'CANCELLED',
    lockedBy: null,
    lockedUntil: null,
  });
  expect(
    (await f.receipts(row.id)).find((entry) => entry.action === 'event.transition')?.after,
  ).toMatchObject({
    action: 'Event.Reopen',
    reopen: {
      supersededFinalSnapshotIds: [beforeSnapshot.id],
      cancelledArchiveReminderIds: [beforeReminder.id],
    },
  });
});

it.each([48 * 3600_000, 48 * 3600_000 + 1])(
  'evaluates the reopen deadline at execution time %i ms after close',
  async (offset) => {
    await close();
    await platformAdmin();
    const row = await f.create(
      { to: 'LIVE', reason: 'Reopen within allowed time' },
      { runAt: lifecycleAt(offset) },
    );
    expect(await f.run(lifecycleAt(offset))).toBe(
      offset === 48 * 3600_000 ? 'SUCCEEDED' : 'FAILED',
    );
    if (offset > 48 * 3600_000) expect((await f.action(row.id)).lastError).toBe('GUARD_FAILED');
  },
);

it.each(['no reason', 'no organisation role', 'other organisation', 'demoted organisation role'])(
  'refuses reopening with %s',
  async (kind) => {
    await close();
    if (kind === 'no reason') await platformAdmin();
    if (kind === 'other organisation') {
      const other = await rawDb.organisation.upsert({
        where: { slug: 'timed-lifecycle-other' },
        create: {
          slug: 'timed-lifecycle-other',
          name: 'Other',
          appName: 'Other',
          defaultTimezone: 'Asia/Singapore',
        },
        update: {},
      });
      await rawDb.organisationMembership.create({
        data: { organisationId: other.id, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
      });
    }
    if (kind === 'demoted organisation role') {
      const member = await platformAdmin();
      await rawDb.organisationMembership.update({
        where: { id: member.id },
        data: { role: 'MEMBER' },
      });
    }
    const row = await f.create({
      to: 'LIVE',
      ...(kind === 'no reason' ? {} : { reason: 'Reviewed reopen' }),
    });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe(
      kind === 'no reason' ? 'GUARD_FAILED' : 'AUTHORITY_CHANGED',
    );
    expect((await f.state()).status).toBe('CLOSED');
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
  },
);

it('uses current platform authority for timed reopen independently of the event role', async () => {
  await close();
  await platformAdmin();
  await rawDb.eventMembership.update({ where: { id: f.membershipId }, data: { role: 'VOLUNTEER' } });
  const row = await f.create({ to: 'LIVE', reason: 'Correct a mistaken close' });
  expect(await f.run()).toBe('SUCCEEDED');
  expect((await f.action(row.id)).lastError).toBeNull();
  expect((await f.state()).status).toBe('LIVE');
  expect((await snapshots())[0]?.supersededAt).toEqual(lifecycleNow);
  expect((await reminders())[0]?.status).toBe('CANCELLED');
});

it.each(['DEACTIVATED', 'ENDED', 'person deactivated'] as const)(
  'refuses timed reopen for %s standing even with owning-organisation platform authority',
  async (standing) => {
    await close();
    await platformAdmin();
    if (standing === 'person deactivated') {
      await rawDb.person.update({
        where: { id: f.creator.id },
        data: { deactivatedAt: lifecycleNow },
      });
    } else {
      await rawDb.eventMembership.update({
        where: { id: f.membershipId },
        data: { status: standing },
      });
    }
    const row = await f.create({ to: 'LIVE', reason: 'Reviewed reopen' });
    expect(await f.run()).toBe('FAILED');
    expect((await f.action(row.id)).lastError).toBe('AUTHORITY_CHANGED');
    expect((await f.state()).status).toBe('CLOSED');
    expect((await snapshots())[0]?.supersededAt).toBeNull();
    expect((await reminders())[0]?.status).toBe('PENDING');
  },
);

it.each(['supersession', 'cancellation', 'completion'])(
  'rolls back timed reopen on %s failure',
  async (stage) => {
    await close();
    await platformAdmin();
    const before = await f.state();
    const oldSnapshots = await snapshots();
    const oldReminders = await reminders();
    const row = await f.create({ to: 'LIVE', reason: 'Reopen transaction drill' });
    const fault = new Error('private reopen fault');
    const spy =
      stage === 'supersession'
        ? vi.spyOn(snapshotRepo, 'supersedeFinalSnapshots').mockRejectedValueOnce(fault)
        : stage === 'cancellation'
          ? vi.spyOn(reminderRepo, 'cancelArchiveReminders').mockRejectedValueOnce(fault)
          : vi.spyOn(executionRepo, 'finishAction').mockRejectedValueOnce(fault);
    try {
      expect(await f.run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await f.state()).toEqual(before);
    expect(await snapshots()).toEqual(oldSnapshots);
    expect(await reminders()).toEqual(oldReminders);
    expect(await f.run((await f.action(row.id)).runAt)).toBe('SUCCEEDED');
  },
);
