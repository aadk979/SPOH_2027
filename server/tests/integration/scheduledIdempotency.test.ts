import { beforeEach, expect, it, vi } from 'vitest';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { JOBS } from '../../src/app/jobs.js';
import * as audit from '../../src/platform/audit/index.js';
import { idempotencyScheduledHandlers } from '../../src/platform/idempotency/jobs.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { getSettings, loadSettings } from '../../src/platform/settings/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const DAY = 86400_000;
const due = new Date(FROZEN_NOW.getTime() + DAY);
const registry = new HandlerRegistry(idempotencyScheduledHandlers);
const at = (offset: number) => new Date(due.getTime() + offset);
const replay = (key: string, offset: number, eventId: string | null = null) =>
  rawDb.idempotencyRecord.create({
    data: {
      key,
      eventId,
      endpoint: 'POST /private-replay',
      actorSub: 'private-actor',
      statusCode: 201,
      responseBody: { privateBody: key },
      createdAt: at(offset),
    },
  });
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: { type: 'idempotency.prune', payload: {}, runAt: due, ...data },
  });
const policy = (value: number) =>
  rawDb.appSetting.upsert({
    where: { key: 'idempotencyRetentionDays' },
    create: { key: 'idempotencyRetentionDays', value },
    update: { value },
  });
const keys = async () =>
  (await rawDb.idempotencyRecord.findMany({ orderBy: { key: 'asc' } })).map((row) => row.key);
const run = async (instant = due) => {
  const [claim] = await claimDueActions({
    workerId: 'replay-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
  return runClaimedAction({ claim: claim!, registry, clock: fixedClock(instant) });
};

beforeEach(async () => {
  await resetDatabase();
  await loadSettings();
});

it('boots both daily handlers and prunes event and platform replays at the strict cutoff', async () => {
  const { eventId } = await testEvent();
  await replay('old-platform', -7 * DAY - 1);
  await replay('old-event', -7 * DAY - 1, eventId);
  await replay('equality', -7 * DAY, eventId);
  await replay('recent', -DAY);
  let instant = FROZEN_NOW;
  const worker = await startScheduledJobs({ now: () => instant });
  try {
    await worker.tick();
    const boot = await rawDb.scheduledAction.findMany({ orderBy: { type: 'asc' } });
    expect(boot.map((row) => row.type)).toEqual(['idempotency.prune', 'session.prune']);
    expect(
      boot.every(
        (row) => row.eventId === null && row.createdByPersonId === null && row.recurrence === 86400,
      ),
    ).toBe(true);
    const action = boot[0]!;
    expect(action.runAt).toEqual(due);
    instant = due;
    await worker.tick();
    expect(await keys()).toEqual(['equality', 'recent']);
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).status,
    ).toBe('SUCCEEDED');
    const receipts = await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } });
    expect(receipts.map((row) => row.action).sort()).toEqual([
      'idempotency.prune',
      'schedule.execute',
    ]);
    expect(
      receipts.every(
        (row) => row.source === 'SCHEDULE' && row.eventId === null && row.actorId === null,
      ),
    ).toBe(true);
    expect(receipts.find((row) => row.action === 'idempotency.prune')?.after).toEqual({
      removed: 2,
      retentionDays: 7,
    });
    expect(JSON.stringify(receipts)).not.toMatch(
      /old-event|old-platform|privateBody|private-actor|private-replay/,
    );
    expect(
      await rawDb.scheduledAction.count({
        where: { type: 'idempotency.prune', status: 'PENDING' },
      }),
    ).toBe(1);
    expect(JOBS.some((job) => job.name === 'idempotency prune')).toBe(false);
  } finally {
    await worker.stop();
  }
});

it('uses policy changed after enqueue even while the compatibility cache is stale', async () => {
  await policy(1);
  await loadSettings();
  const action = await create();
  await replay('retained', -2 * DAY);
  await replay('equality', -3 * DAY);
  await replay('expired', -3 * DAY - 1);
  await policy(3);
  expect(getSettings().idempotencyRetentionDays).toBe(1);
  expect(await run()).toBe('SUCCEEDED');
  expect(await keys()).toEqual(['equality', 'retained']);
  expect(
    (
      await rawDb.auditLog.findFirstOrThrow({
        where: { scheduledActionId: action.id, action: 'idempotency.prune' },
      })
    ).after,
  ).toEqual({ removed: 1, retentionDays: 3 });
});

it.each([0, 91, 1.5])('falls back to seven days for invalid stored retention %s', async (value) => {
  await policy(value);
  await create();
  await replay('expired', -7 * DAY - 1);
  await replay('retained', -2 * DAY);
  expect(await run()).toBe('SUCCEEDED');
  expect(await keys()).toEqual(['retained']);
  expect(
    (await rawDb.auditLog.findFirstOrThrow({ where: { action: 'idempotency.prune' } })).after,
  ).toEqual({ removed: 1, retentionDays: 7 });
});

it.each(['prune audit', 'completion'])(
  'rolls back deletion when %s fails and retries cleanly',
  async (stage) => {
    await replay('expired', -7 * DAY - 1);
    await replay('retained', -DAY);
    const action = await create();
    const spy =
      stage === 'prune audit'
        ? vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('private database fault'))
        : vi
            .spyOn(executionRepo, 'finishAction')
            .mockRejectedValueOnce(new Error('private database fault'));
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await keys()).toEqual(['expired', 'retained']);
    expect(
      await rawDb.auditLog.count({
        where: { scheduledActionId: action.id, action: 'idempotency.prune' },
      }),
    ).toBe(0);
    const pending = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(pending).toMatchObject({ attempts: 1, lastError: 'EXECUTION_FAILED' });
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await keys()).toEqual(['retained']);
    expect(
      await rawDb.auditLog.count({
        where: { scheduledActionId: action.id, action: 'idempotency.prune' },
      }),
    ).toBe(1);
  },
);

it.each(['user creator', 'event scope'])('refuses invalid system authority: %s', async (kind) => {
  const { eventId } = await testEvent();
  const person = await createVolunteer({ email: 'replay-maintenance@test.example', role: 'ADMIN' });
  const action = await create(
    kind === 'user creator' ? { createdByPersonId: person.id } : { eventId },
  );
  await replay('expired', -7 * DAY - 1);
  expect(await run()).toBe('FAILED');
  expect(await keys()).toEqual(['expired']);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
  ).toBe('SYSTEM_ONLY');
});

it('rejects payload selectors and client-controlled retention', async () => {
  const action = await create({
    payload: { key: 'expired', cutoff: '2099-01-01', retentionDays: 1 },
  });
  await replay('expired', -7 * DAY - 1);
  expect(await run()).toBe('FAILED');
  expect(await keys()).toEqual(['expired']);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
  ).toBe('INVALID_PAYLOAD');
});

it('records a no-op completion without a fictitious prune audit', async () => {
  const action = await create();
  await replay('recent', -DAY);
  expect(await run()).toBe('SUCCEEDED');
  expect(await keys()).toEqual(['recent']);
  expect(
    (await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } })).map(
      (row) => row.action,
    ),
  ).toEqual(['schedule.execute']);
});
