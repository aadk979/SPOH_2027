import { beforeEach, expect, it, vi } from 'vitest';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { JOBS } from '../../src/app/jobs.js';
import { authScheduledHandlers } from '../../src/modules/auth/index.js';
import * as audit from '../../src/platform/audit/index.js';
import * as cacheBus from '../../src/platform/events/cacheBus.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const DAY = 86400_000;
const due = new Date(FROZEN_NOW.getTime() + DAY);
const registry = new HandlerRegistry(authScheduledHandlers);
let person: TestVolunteer;
const at = (offset: number) => new Date(due.getTime() + offset);
const session = (tokenHash: string, data = {}) =>
  rawDb.refreshSession.create({
    data: {
      volunteerId: person.id,
      familyId: 'session-prune-test',
      tokenHash,
      expiresAt: at(DAY),
      ...data,
    },
  });
const create = (data = {}) =>
  rawDb.scheduledAction.create({
    data: {
      type: 'session.prune',
      payload: {},
      runAt: due,
      ...data,
    },
  });
const run = async (instant = due) => {
  const [claim] = await claimDueActions({
    workerId: 'session-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
  return runClaimedAction({ claim: claim!, registry, clock: fixedClock(instant) });
};
const hashes = async () =>
  (await rawDb.refreshSession.findMany({ orderBy: { tokenHash: 'asc' } })).map(
    (row) => row.tokenHash,
  );

beforeEach(async () => {
  await resetDatabase();
  person = await createVolunteer({ email: 'scheduled-session@test.example', role: 'VOLUNTEER' });
});

it('boots one daily recurring handler, runs it through the real worker and removes its legacy interval', async () => {
  await session('expired', { expiresAt: at(-1) });
  await session('expiry-equality', { expiresAt: due });
  await session('revoked-old', { revokedAt: at(-7 * DAY - 1) });
  await session('revoked-equality', { revokedAt: at(-7 * DAY) });
  await session('revoked-recent', { revokedAt: at(-DAY) });
  await session('live');
  let instant = FROZEN_NOW;
  const worker = await startScheduledJobs({ now: () => instant });
  try {
    await worker.tick();
    const action = await rawDb.scheduledAction.findFirstOrThrow({
      where: { type: 'session.prune' },
    });
    expect(action).toMatchObject({
      eventId: null,
      recurrence: 86400,
      createdByPersonId: null,
      runAt: due,
    });
    instant = due;
    await worker.tick();
    expect(await hashes()).toEqual([
      'expiry-equality',
      'live',
      'revoked-equality',
      'revoked-recent',
    ]);
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).status,
    ).toBe('SUCCEEDED');
    const receipts = await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } });
    expect(receipts.map((row) => row.action).sort()).toEqual(['schedule.execute', 'session.prune']);
    expect(
      receipts.every(
        (row) => row.source === 'SCHEDULE' && row.eventId === null && row.actorId === null,
      ),
    ).toBe(true);
    expect(receipts.find((row) => row.action === 'session.prune')?.after).toEqual({ removed: 2 });
    expect(JSON.stringify(receipts)).not.toMatch(/revoked-old|session-prune-test/);
    expect(
      await rawDb.scheduledAction.count({ where: { type: 'session.prune', status: 'PENDING' } }),
    ).toBe(1);
    expect(JOBS.some((job) => job.name === 'refresh session prune')).toBe(false);
  } finally {
    await worker.stop();
  }
});

it.each(['prune audit', 'cache publication', 'completion'])(
  'rolls back deletion and module audit when %s fails, then retries once cleanly',
  async (stage) => {
    await session('expired', { expiresAt: at(-1) });
    await session('live');
    const action = await create();
    const spy =
      stage === 'prune audit'
        ? vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('private database fault'))
        : stage === 'cache publication'
          ? vi
              .spyOn(cacheBus, 'publishCacheEvent')
              .mockRejectedValueOnce(new Error('private database fault'))
          : vi
              .spyOn(executionRepo, 'finishAction')
              .mockRejectedValueOnce(new Error('private database fault'));
    try {
      expect(await run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await hashes()).toEqual(['expired', 'live']);
    expect(
      await rawDb.auditLog.count({
        where: { scheduledActionId: action.id, action: 'session.prune' },
      }),
    ).toBe(0);
    const pending = await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(pending).toMatchObject({ lastError: 'EXECUTION_FAILED', attempts: 1 });
    expect(await run(pending.runAt)).toBe('SUCCEEDED');
    expect(await hashes()).toEqual(['live']);
    expect(
      await rawDb.auditLog.count({
        where: { scheduledActionId: action.id, action: 'session.prune' },
      }),
    ).toBe(1);
  },
);

it.each(['user creator', 'event scope'])(
  'refuses an invalid maintenance principal: %s',
  async (kind) => {
    const { eventId } = await testEvent();
    await session('expired', { expiresAt: at(-1) });
    const action = await create(
      kind === 'user creator' ? { createdByPersonId: person.id } : { eventId },
    );
    expect(await run()).toBe('FAILED');
    expect(await hashes()).toEqual(['expired']);
    expect(
      (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
    ).toBe('SYSTEM_ONLY');
  },
);

it('refuses payload fields that could select a session or override the retention cutoff', async () => {
  await session('expired', { expiresAt: at(-1) });
  const action = await create({ payload: { sessionId: 'private-id', cutoff: '2099-01-01' } });
  expect(await run()).toBe('FAILED');
  expect(await hashes()).toEqual(['expired']);
  expect(
    (await rawDb.scheduledAction.findUniqueOrThrow({ where: { id: action.id } })).lastError,
  ).toBe('INVALID_PAYLOAD');
});

it('records a no-op maintenance run without a fictitious deletion audit', async () => {
  await session('live');
  const action = await create();
  expect(await run()).toBe('SUCCEEDED');
  expect(await hashes()).toEqual(['live']);
  expect(
    (await rawDb.auditLog.findMany({ where: { scheduledActionId: action.id } })).map(
      (row) => row.action,
    ),
  ).toEqual(['schedule.execute']);
});
